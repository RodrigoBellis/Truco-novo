import { planKnockoutSync, type GroupId, type GroupStageStatus, type KnockoutPlan, type KnockoutSnapshot, type KnockoutStep } from "@truco/shared";
import { store } from "../data/store.js";
import { StoreConflictError, StoreOperationError } from "../data/storeErrors.js";
import { withChampionshipLock } from "../utils/championshipLock.js";
import { computeStandings } from "./standingsService.js";

export class BracketError extends Error {}

/** A gravação foi concluída; o worker recupera o avanço sem reenviar o placar. */
export class ProgressionPendingError extends Error {
  constructor(message: string, public readonly retryable = true) { super(message); }
}

export const PROGRESSION_PENDING_MESSAGE = "O placar foi gravado. O avanço do mata-mata está pendente e será tentado automaticamente. Não reenvie o resultado.";

export interface KnockoutSyncReport {
  /** Passos executados nesta chamada, na ordem. Vazio quando já estava tudo certo. */
  steps: KnockoutStep["type"][];
  anomalies: string[];
  groupStage: GroupStageStatus;
  pendingTieGroups: GroupId[];
}

const MAX_PASSES = 12;

function temporaryProgressionError(error: unknown): boolean {
  return (error instanceof StoreOperationError && error.retryable)
    || (error instanceof TypeError && /fetch|network|connection|timeout/i.test(error.message));
}

async function loadSnapshot(championshipId: string): Promise<{ snapshot: KnockoutSnapshot; championship: Awaited<ReturnType<typeof store.getCurrentChampionship>> }> {
  const championship = await store.getCurrentChampionship();
  const [standingsA, standingsB, bracket, knockoutMatches, teams, champion] = await Promise.all([
    computeStandings(championshipId, "A"),
    computeStandings(championshipId, "B"),
    store.listBracketMatches(championshipId),
    store.listMatches(championshipId, { stage: "mata-mata" }),
    store.listTeams(championshipId),
    store.getEditionChampion(championshipId),
  ]);
  const groupByTeam = new Map(teams.map((team) => [team.id, team.groupId]));
  if (championship.truco_id !== championshipId) throw new StoreOperationError("A edição em andamento mudou.", "edition_changed");
  return {
    championship,
    snapshot: { standings: { A: standingsA, B: standingsB }, bracket, knockoutMatches, groupOf: (teamId) => groupByTeam.get(teamId), phase: championship.current_phase, champion },
  };
}

/** O que a sincronização faria agora, sem gravar nada. */
export async function inspectKnockout(championshipId: string): Promise<KnockoutPlan> {
  return planKnockoutSync((await loadSnapshot(championshipId)).snapshot, () => store.newId());
}

async function execute(championshipId: string, step: KnockoutStep, championship: { edition: number; name: string; year: number }): Promise<void> {
  if (step.type === "clear-knockout") {
    await store.clearKnockout(championshipId);
  } else if (step.type === "create-bracket") {
    await store.createBracketMatches(championshipId, step.rows);
  } else if (step.type === "set-quarter-source") {
    await store.setBracketSlotBSource(step.bracketMatchId, step.sourceBracketMatchId);
  } else if (step.type === "create-match") {
    const match = await store.createMatch({ championshipId, stage: "mata-mata", round: step.round, order: step.order, teamAId: step.teamAId, teamBId: step.teamBId });
    await store.linkBracketMatch(step.bracketMatchId, match.id);
  } else if (step.type === "link-match") {
    await store.linkBracketMatch(step.bracketMatchId, step.matchId);
  } else if (step.type === "delete-match") {
    await store.deletePendingKnockoutMatch(step.matchId);
  } else if (step.type === "set-match-team") {
    await store.setMatchTeam(step.matchId, step.side, step.teamId);
  } else if (step.type === "record-champion") {
    const [champion, runnerUp] = await Promise.all([store.getTeam(step.championTeamId), store.getTeam(step.runnerUpTeamId)]);
    await store.saveEditionChampion({
      championshipId,
      edition: championship.edition,
      name: championship.name,
      year: championship.year,
      championTeamId: step.championTeamId,
      runnerUpTeamId: step.runnerUpTeamId,
      finalResult: step.finalResult,
      notes: `Edição encerrada com vitória de ${champion?.name ?? "—"} sobre ${runnerUp?.name ?? "—"}.`,
    });
  } else {
    await store.setCurrentPhase(championshipId, step.phase);
  }
}

/**
 * Leva o mata-mata ao estado que as regras pedem (planKnockoutSync em @truco/shared): gera o
 * chaveamento quando a fase de grupos fecha sem empate pendente, desfaz e refaz quando uma
 * correção de grupo muda a classificação, abre cada fase quando a anterior termina e registra
 * o campeão. Lê o estado, aplica a próxima leva de passos e repete até não sobrar nada.
 *
 * Idempotente e auto-reparável: como cada rodada parte do que está gravado, chamar de novo
 * depois de uma falha no meio completa o que faltou, sem duplicar. Um conflito de unicidade
 * (outra instância gravou o mesmo passo) só faz a rodada seguinte reler o estado.
 *
 * Quem chama deve estar dentro de withChampionshipLock; use syncKnockoutLocked se não estiver.
 */
export async function syncKnockout(championshipId: string): Promise<KnockoutSyncReport> {
  const executed: KnockoutStep["type"][] = [];
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const { snapshot, championship } = await loadSnapshot(championshipId);
    const plan = planKnockoutSync(snapshot, () => store.newId());
    if (plan.steps.length === 0) {
      if (plan.anomalies.length > 0) console.warn(`[mata-mata] Estado fora das regras, nada foi alterado: ${plan.anomalies.join(" | ")}`);
      if (championship.progression_pending && plan.anomalies.length === 0) {
        try { await store.applyKnockoutPlan(championshipId, championship.progression_revision, []); }
        catch (error) { if (error instanceof StoreConflictError) continue; throw error; }
      }
      return { steps: executed, anomalies: plan.anomalies, groupStage: plan.status, pendingTieGroups: plan.pendingTieGroups };
    }
    try {
      if (await store.applyKnockoutPlan(championshipId, championship.progression_revision, plan.steps)) {
        executed.push(...plan.steps.map((step) => step.type));
        continue;
      }
    } catch (error) {
      if (error instanceof StoreConflictError) continue;
      throw error;
    }
    for (const step of plan.steps) {
      try {
        await execute(championshipId, step, championship);
        executed.push(step.type);
      } catch (error) {
        if (!(error instanceof StoreConflictError)) throw error;
        // Outra requisição já fez este passo: o resto do plano pode estar velho. Relê e replaneja.
        break;
      }
    }
  }
  throw new Error("A sincronização do mata-mata não convergiu.");
}

export function syncKnockoutLocked(championshipId: string): Promise<KnockoutSyncReport> {
  return withChampionshipLock(championshipId, () => syncKnockout(championshipId));
}

/**
 * Sincroniza depois de uma gravação que já aconteceu. Uma falha passageira ganha uma segunda
 * tentativa na hora; se ainda assim falhar, quem chamou recebe ProgressionPendingError e
 * o worker conclui o avanço sem efeitos colaterais nas consultas.
 */
export async function syncKnockoutAfterWrite(championshipId: string): Promise<KnockoutSyncReport> {
  try {
    return await syncKnockout(championshipId);
  } catch (first) {
    if (!temporaryProgressionError(first)) {
      throw new ProgressionPendingError("O placar foi gravado, mas o avanço exige revisão do administrador. Não reenvie o resultado.", false);
    }
    try {
      return await syncKnockout(championshipId);
    } catch (second) {
      const retryable = temporaryProgressionError(second);
      throw new ProgressionPendingError(retryable ? PROGRESSION_PENDING_MESSAGE : "O placar foi gravado, mas o avanço exige revisão do administrador. Não reenvie o resultado.", retryable);
    }
  }
}

// A recuperação é executada pelo servidor, nunca por um GET.
let workerRunning = false;
let permanentFailure: string | null = null;
export async function recoverPendingKnockout(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const championship = await store.getCurrentChampionship();
    await withChampionshipLock(championship.truco_id, async () => {
      const { snapshot } = await loadSnapshot(championship.truco_id);
      const fingerprint = JSON.stringify([championship.truco_id, championship.progression_revision, snapshot]);
      if (fingerprint === permanentFailure) return;
      if (planKnockoutSync(snapshot, () => store.newId()).steps.length === 0 && !championship.progression_pending) return;
      try {
        await syncKnockoutAfterWrite(championship.truco_id);
        permanentFailure = null;
      } catch (error) {
        if (error instanceof ProgressionPendingError && !error.retryable) permanentFailure = fingerprint;
        throw error;
      }
    });
  } finally { workerRunning = false; }
}

export function startKnockoutRecovery(): () => void {
  const tick = () => { void recoverPendingKnockout().catch((error: unknown) => console.error(`[mata-mata] Avanço pendente; consulte o estado e a configuração do campeonato. Causa: ${error instanceof StoreOperationError ? `${error.message} (código ${error.code})${error.detail ? `: ${error.detail}` : ""}` : error instanceof Error ? error.message : String(error)}`)); };
  const timer = setInterval(tick, 5_000);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}

/** Mensagem para o administrador quando a reconciliação não tem o que gerar. */
export function describeGroupStageBlock(report: Pick<KnockoutSyncReport, "groupStage" | "pendingTieGroups">): string | null {
  if (report.groupStage === "em-andamento") return "A fase de grupos precisa estar concluída em ambos os grupos.";
  if (report.groupStage === "empate-pendente") {
    return `Há empate sem critério de desempate no Grupo ${report.pendingTieGroups.join(" e no Grupo ")}: o administrador precisa decidir as posições para o mata-mata ser gerado.`;
  }
  return null;
}
