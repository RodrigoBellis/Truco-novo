import { EDITION_FINISHED_MESSAGE, RESULTS_LOCKED_MESSAGE, planResultChange, type MatchResult, type UserRole } from "@truco/shared";
import { store } from "../data/store.js";
import { withChampionshipLock } from "../utils/championshipLock.js";
import { syncKnockoutAfterWrite } from "./bracketService.js";
import { canRecordEditionResult, resultsLockBlocks, editionFinishedBlocks } from "./matchAuthorization.js";
import { StoreConflictError, StoreOperationError } from "../data/storeErrors.js";

export class MatchError extends Error {}

/** Edição encerrada: jogador não lança nem edita mais nada (a rota responde 403). */
export class EditionFinishedError extends MatchError {}

/** O placar é válido, mas o estado do campeonato não permite gravá-lo (a rota responde 409). */
export class ResultConflictError extends MatchError {}

export class ResultPermissionError extends MatchError {
  constructor(message: string, public readonly code = "result_forbidden") { super(message); }
}

const VALID_SCORES = new Set(["2-0", "2-1", "1-2", "0-2"]);

export interface ResultActor {
  id: string;
  role: UserRole;
}

/**
 * Grava um placar e deixa o campeonato andar sozinho: no último jogo da fase de grupos o
 * mata-mata nasce, cada fase encerrada abre a seguinte e a final registra o campeão.
 *
 * Tudo roda dentro da fila do campeonato (withChampionshipLock): dois lançamentos simultâneos
 * são processados um depois do outro, então a checagem "pode gravar?" e o avanço nunca se
 * intercalam neste processo. A ordem dos jogos da fase de grupos não importa: nenhum placar
 * de grupo depende de outro jogo, de rodada, mesa, bloco ou posição na fila.
 */
export function recordResult(championshipId: string, matchId: string, result: MatchResult, actor: ResultActor): Promise<void> {
  return withChampionshipLock(championshipId, () => recordResultUnlocked(championshipId, matchId, result, actor));
}

/** Mesmo fluxo, sem a fila do processo. Exportado só para testar o que acontece entre instâncias. */
export async function recordResultUnlocked(championshipId: string, matchId: string, result: MatchResult, actor: ResultActor): Promise<void> {
  const championship = await store.getCurrentChampionship();
  const match = await store.getMatch(matchId);
  if (!match) throw new MatchError("Jogo não encontrado.");
  if (match.championshipId !== championshipId) throw new MatchError("A partida não pertence à edição em andamento.");

  const key = `${result.setsA}-${result.setsB}`;
  if (!VALID_SCORES.has(key)) {
    throw new MatchError("Placar inválido. Utilize 2x0, 2x1, 1x2 ou 0x2.");
  }

  // Lido dentro da fila: quem chega logo depois do placar da final já encontra a edição encerrada.
  const currentActor = await store.getResultActor(actor.id);
  if (!currentActor || currentActor.mustChangePassword) throw new ResultPermissionError("Seu perfil mudou. Entre novamente e confira suas permissões.");
  if (championship.truco_id !== championshipId) throw new ResultPermissionError("A edição em andamento mudou. Atualize a página.");
  if (resultsLockBlocks(currentActor.role, store.isResultsLocked(championship))) throw new ResultPermissionError(RESULTS_LOCKED_MESSAGE, "results_locked");
  const participants = await store.getMatchPlayerIds(championshipId, match.teamAId, match.teamBId);
  if (!canRecordEditionResult(currentActor.role, currentActor.playerId, participants.playerIds, true)) throw new ResultPermissionError("Você só pode registrar o resultado de um jogo da sua dupla nesta edição.");
  if (editionFinishedBlocks(currentActor.role, championship.current_phase)) throw new EditionFinishedError(EDITION_FINISHED_MESSAGE);
  if (match.stage === "mata-mata" && !match.result && championship.progression_pending) throw new ResultConflictError("O avanço anterior ainda está pendente. Aguarde a atualização dos confrontos antes de lançar outro placar.");

  const bracket = await store.listBracketMatches(championshipId);
  const knockoutMatches = await store.listMatches(championshipId, { stage: "mata-mata" });
  const plan = planResultChange(match, result, bracket, knockoutMatches);
  if (plan.blocked) throw new ResultConflictError(plan.blocked);

  try { await store.saveMatchResult({
    championshipId,
    matchId,
    result,
    actorId: actor.id,
    expectedRevision: championship.progression_revision,
  }); } catch (error) {
    if (error instanceof StoreConflictError) throw new ResultConflictError("O campeonato mudou durante a gravação. Atualize os dados e confira o placar antes de tentar novamente.");
    if (error instanceof StoreOperationError && error.code === "42501") throw new ResultPermissionError("As permissões ou o cadeado mudaram. Atualize a página.");
    throw error;
  }

  // O avanço e os reparos derivam do estado salvo e usam a mesma transação versionada.
  await syncKnockoutAfterWrite(championshipId);
}
