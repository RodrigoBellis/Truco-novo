import { BRACKET_ROUND_LABEL, KNOCKOUT_PLAN, buildKnockoutBracket, type BracketMatch, type BracketSlotSource, type KnockoutKey } from "./bracket.js";
import type { StandingRow } from "./group.js";
import type { Match, MatchResult } from "./match.js";
import { EDITION_GROUP_IDS, TEAMS_PER_GROUP, type GroupId } from "./team.js";

// Andamento automático do campeonato: da fase de grupos ao campeão. Tudo aqui é função pura;
// o backend real, o modo ensaio e o simulador só executam os passos que saem daqui.

export const PHASE_GROUPS = "Fase de Grupos";
export const PHASE_KNOCKOUT = "Mata-mata";
export const PHASE_FINISHED = "Campeonato Finalizado";

/** Mensagem única para o jogador que tenta lançar ou editar placar com a edição encerrada. */
export const EDITION_FINISHED_MESSAGE = "O campeonato foi encerrado. Só o administrador pode corrigir resultados.";

/** A edição está encerrada quando a final e a disputa de 3º lugar têm placar (e o campeão foi registrado). */
export function isEditionFinished(phase: string | null | undefined): boolean {
  return phase === PHASE_FINISHED;
}

const winnerOf = (match: Pick<Match, "teamAId" | "teamBId">, result: MatchResult) => (result.setsA > result.setsB ? match.teamAId : match.teamBId);

// ---------- Fim da fase de grupos ----------

/** Grupo encerrado: todas as duplas com todos os jogos disputados (7 duplas, 6 jogos cada). */
export function isGroupFinished(rows: readonly StandingRow[]): boolean {
  return rows.length === TEAMS_PER_GROUP && rows.every((row) => row.jogos === TEAMS_PER_GROUP - 1);
}

export type GroupStageStatus = "em-andamento" | "empate-pendente" | "definida";

export interface GroupStageOutcome {
  status: GroupStageStatus;
  /** Grupos encerrados com empate absoluto à espera da decisão do administrador. */
  pendingTieGroups: GroupId[];
}

/**
 * O mata-mata só pode nascer com a classificação "definida": o grupo encerrado e
 * nenhum empate absoluto pendente. Empate absoluto nunca é resolvido aqui.
 */
export function groupStageOutcome(standings: Record<GroupId, readonly StandingRow[]>): GroupStageOutcome {
  const unfinished = EDITION_GROUP_IDS.some((groupId) => !isGroupFinished(standings[groupId]));
  const pendingTieGroups = EDITION_GROUP_IDS.filter((groupId) => isGroupFinished(standings[groupId]) && standings[groupId].some((row) => row.tiePending));
  return { status: unfinished ? "em-andamento" : pendingTieGroups.length > 0 ? "empate-pendente" : "definida", pendingTieGroups };
}

// ---------- Correção de placar ----------

export interface ResultChangePlan {
  /** Motivo para recusar o lançamento/correção; null quando pode gravar. */
  blocked: string | null;
  /**
   * Jogos seguintes, ainda sem placar, que precisam trocar a dupla porque o vencedor mudou.
   * Uma semifinal alimenta dois jogos: a final (vencedor) e a disputa de 3º (perdedor).
   */
  repairs: Array<{ matchId: string; side: "A" | "B"; teamId: string }>;
}

const allowed: ResultChangePlan = { blocked: null, repairs: [] };

/**
 * Decide se um placar pode ser gravado sem deixar o mata-mata incoerente. Função pura.
 * `matches` são os jogos do mata-mata da edição.
 *
 * - Fase de grupos: aceito enquanto NENHUM jogo do mata-mata tiver placar. Se o chaveamento
 *   já existe, ele é desfeito e refeito pela nova classificação (planKnockoutSync). Depois do
 *   primeiro placar de mata-mata, nenhum placar de grupo muda mais, para ninguém.
 * - Mata-mata: corrigir o placar mantendo o vencedor é sempre possível. Trocar o vencedor só
 *   é possível enquanto nenhum jogo alimentado por ele (vencedor ou perdedor) tiver placar.
 */
export function planResultChange(match: Match, result: MatchResult, bracket: readonly BracketMatch[], matches: readonly Match[]): ResultChangePlan {
  if (match.stage === "grupos") {
    const played = matches.find((item) => item.stage === "mata-mata" && item.result);
    if (!played) return allowed;
    const label = bracket.find((item) => item.matchId === played.id)?.label ?? played.round;
    return { ...allowed, blocked: `O mata-mata já tem placar lançado (${label}): os resultados da fase de grupos não podem mais ser alterados.` };
  }

  const own = bracket.find((item) => item.matchId === match.id);
  if (!own || !match.result || winnerOf(match, match.result) === winnerOf(match, result)) return allowed;

  const newWinner = winnerOf(match, result);
  const newLoser = newWinner === match.teamAId ? match.teamBId : match.teamAId;
  const repairs: ResultChangePlan["repairs"] = [];
  for (const next of bracket) {
    for (const side of ["A", "B"] as const) {
      const slot = side === "A" ? next.slotA : next.slotB;
      if ((slot.type !== "winner" && slot.type !== "loser") || slot.bracketMatchId !== own.id || !next.matchId) continue;
      const nextMatch = matches.find((item) => item.id === next.matchId);
      if (!nextMatch) continue;
      if (nextMatch.result) {
        return { ...allowed, blocked: `Não é possível trocar o vencedor: ${next.label} já foi disputada com as duplas definidas por este confronto.` };
      }
      repairs.push({ matchId: nextMatch.id, side, teamId: slot.type === "winner" ? newWinner : newLoser });
    }
  }
  return { ...allowed, repairs };
}

// ---------- Plano de sincronização do mata-mata ----------

/** O que o histórico guarda da edição em disputa (uma linha por edição). */
export interface EditionChampionRecord {
  championTeamId: string | null;
  runnerUpTeamId: string | null;
  finalResult: string | null;
}

export interface KnockoutSnapshot {
  /** Classificação atual do grupo, já com as decisões de empate do administrador. */
  standings: Record<GroupId, readonly StandingRow[]>;
  bracket: readonly BracketMatch[];
  /** Todos os jogos do mata-mata da edição, vinculados ou não ao chaveamento. */
  knockoutMatches: readonly Match[];
  groupOf: (teamId: string) => GroupId | null | undefined;
  phase: string;
  champion: EditionChampionRecord | null;
}

export type KnockoutStep =
  /** Apaga o chaveamento inteiro e os jogos de mata-mata ainda sem placar. */
  | { type: "clear-knockout"; reason: string }
  | { type: "create-bracket"; rows: BracketMatch[] }
  /** Cria o jogo e vincula ao confronto. */
  | { type: "create-match"; bracketMatchId: string; round: string; order: number; teamAId: string; teamBId: string }
  /** Jogo que já existe para o confronto, mas ficou sem vínculo. */
  | { type: "link-match"; bracketMatchId: string; matchId: string }
  /** Jogo sem placar que não corresponde a nenhum confronto com adversários definidos. */
  | { type: "delete-match"; matchId: string }
  | { type: "set-match-team"; matchId: string; side: "A" | "B"; teamId: string }
  | { type: "record-champion"; championTeamId: string; runnerUpTeamId: string; finalResult: string }
  | { type: "set-phase"; phase: string };

export interface KnockoutPlan extends GroupStageOutcome {
  /** Próximos passos. Vazio quando o estado já está certo (ou quando há anomalia). */
  steps: KnockoutStep[];
  /** Estados que as regras não deixam acontecer e que o sistema não corrige sozinho. */
  anomalies: string[];
}

const fixtureOf = (item: Pick<BracketMatch, "round" | "order">) => KNOCKOUT_PLAN.find((fixture) => fixture.round === item.round && fixture.order === item.order);

/**
 * Compara o estado gravado com o que as regras pedem e devolve a PRÓXIMA leva de passos.
 * Quem executa aplica os passos, lê o estado de novo e chama outra vez, até a lista vir vazia.
 * Por depender só do estado, a rotina é idempotente e conserta sozinha uma execução que
 * parou no meio: nunca cria um segundo chaveamento nem um segundo jogo para o mesmo confronto.
 *
 * 1. Classificação não definida (falta jogo ou há empate absoluto): não existe mata-mata.
 * 2. Classificação definida: os seis confrontos de KNOCKOUT_PLAN com as duplas das posições.
 *    Chaveamento divergente só é refeito enquanto nenhum jogo do mata-mata tem placar.
 * 3. Um jogo só existe quando as duas duplas são conhecidas (a final e o 3º lugar nascem
 *    juntos, quando as duas semifinais terminam).
 * 4. Final com placar: campeão e vice no histórico na mesma hora.
 * 5. Edição encerrada só com final E disputa de 3º lugar com placar.
 */
export function planKnockoutSync(snapshot: KnockoutSnapshot, newId: () => string): KnockoutPlan {
  const { standings, bracket, knockoutMatches, phase, champion } = snapshot;
  const plan: KnockoutPlan = { ...groupStageOutcome(standings), steps: [], anomalies: [] };
  const matchById = new Map(knockoutMatches.map((match) => [match.id, match]));
  const scored = knockoutMatches.some((match) => match.result);

  if (plan.status !== "definida") {
    if (scored) {
      plan.anomalies.push("A classificação da fase de grupos não está definida, mas o mata-mata já tem placar lançado.");
    } else if (bracket.length > 0 || knockoutMatches.length > 0) {
      plan.steps.push({ type: "clear-knockout", reason: plan.status === "empate-pendente" ? "empate absoluto pendente" : "fase de grupos reaberta" });
    } else if (phase === PHASE_KNOCKOUT || phase === PHASE_FINISHED) {
      plan.steps.push({ type: "set-phase", phase: PHASE_GROUPS });
    }
    return plan;
  }

  const seedAt = (group: GroupId, position: number) => standings[group].find((row) => row.position === position)?.teamId;
  if (bracket.length === 0) {
    plan.steps.push({ type: "create-bracket", rows: buildKnockoutBracket(seedAt, newId) });
    return plan;
  }

  // Estrutura: exatamente os seis confrontos do plano, com as duplas das posições atuais.
  const entries = new Map<KnockoutKey, BracketMatch>();
  let coherent = bracket.length === KNOCKOUT_PLAN.length;
  for (const item of bracket) {
    const fixture = fixtureOf(item);
    if (!fixture || entries.has(fixture.key)) coherent = false;
    else entries.set(fixture.key, item);
  }
  const linkedIds = bracket.flatMap((item) => (item.matchId && matchById.has(item.matchId) ? [item.matchId] : []));
  if (new Set(linkedIds).size !== linkedIds.length) coherent = false;
  if (coherent) {
    const sideOk = (key: KnockoutKey, side: "slotA" | "slotB"): boolean => {
      const fixture = KNOCKOUT_PLAN.find((item) => item.key === key)!;
      const expected = fixture[side];
      const actual: BracketSlotSource = entries.get(key)![side];
      if (expected.type === "position") return actual.type === "direct" && actual.teamId === seedAt(expected.group, expected.position);
      if (actual.type !== expected.type) return false;
      return bracket.find((item) => item.id === actual.bracketMatchId) === entries.get(expected.of);
    };
    coherent = KNOCKOUT_PLAN.every((fixture) => sideOk(fixture.key, "slotA") && sideOk(fixture.key, "slotB"));
  }
  if (!coherent) {
    if (scored) plan.anomalies.push("O chaveamento não corresponde à classificação final, mas o mata-mata já tem placar lançado.");
    else plan.steps.push({ type: "clear-knockout", reason: "chaveamento diferente da classificação final" });
    return plan;
  }

  const linked = (item: BracketMatch) => (item.matchId ? matchById.get(item.matchId) : undefined);
  const ordered = KNOCKOUT_PLAN.map((fixture) => entries.get(fixture.key)!);

  const teamOf = (slot: BracketSlotSource): string | null => {
    if (slot.type === "direct") return slot.teamId;
    if (slot.type !== "winner" && slot.type !== "loser") return null;
    const source = bracket.find((item) => item.id === slot.bracketMatchId);
    const match = source ? linked(source) : undefined;
    if (!match?.result) return null;
    const won = winnerOf(match, match.result);
    return slot.type === "winner" ? won : won === match.teamAId ? match.teamBId : match.teamAId;
  };
  const pairing = (item: BracketMatch) => {
    const teamAId = teamOf(item.slotA);
    const teamBId = teamOf(item.slotB);
    return teamAId && teamBId ? { teamAId, teamBId } : null;
  };

  // Jogos de mata-mata sem vínculo: adota o que pertence a um confronto pronto; o resto sai.
  const claimed = new Set<string>();
  for (const match of knockoutMatches) {
    if (linkedIds.includes(match.id)) continue;
    const home = ordered.find((item) => !linked(item) && !claimed.has(item.id) && BRACKET_ROUND_LABEL[item.round] === match.round && item.order === match.order && pairing(item));
    if (home) {
      claimed.add(home.id);
      plan.steps.push({ type: "link-match", bracketMatchId: home.id, matchId: match.id });
    } else if (!match.result) {
      plan.steps.push({ type: "delete-match", matchId: match.id });
    } else {
      plan.anomalies.push(`Há um jogo de mata-mata com placar (${match.round}) que não pertence a nenhum confronto do chaveamento.`);
    }
  }
  if (plan.steps.length > 0 || plan.anomalies.length > 0) return plan;

  // Cada confronto: cria o jogo quando os dois lados são conhecidos; acerta jogo ainda sem placar.
  for (const item of ordered) {
    const teams = pairing(item);
    const match = linked(item);
    if (!match) {
      if (teams) plan.steps.push({ type: "create-match", bracketMatchId: item.id, round: BRACKET_ROUND_LABEL[item.round], order: item.order, ...teams });
      continue;
    }
    if (!teams) {
      if (match.result) plan.anomalies.push(`${item.label} tem placar, mas os adversários dela ainda não estão definidos pelas fases anteriores.`);
      else plan.steps.push({ type: "delete-match", matchId: match.id });
      continue;
    }
    for (const side of ["A", "B"] as const) {
      const expected = side === "A" ? teams.teamAId : teams.teamBId;
      if ((side === "A" ? match.teamAId : match.teamBId) === expected) continue;
      if (match.result) plan.anomalies.push(`${item.label} foi disputada por uma dupla diferente da que venceu a fase anterior.`);
      else plan.steps.push({ type: "set-match-team", matchId: match.id, side, teamId: expected });
    }
  }
  if (plan.steps.length > 0 || plan.anomalies.length > 0) return plan;

  // Final: campeão e vice no histórico assim que a final tem placar. A edição só encerra com a
  // final E a disputa de 3º lugar decididas. O histórico vem antes da fase, para "encerrado"
  // nunca existir sem campeão registrado.
  const final = linked(entries.get("F")!);
  const thirdPlace = linked(entries.get("T")!);
  if (final?.result) {
    const championTeamId = winnerOf(final, final.result);
    const runnerUpTeamId = championTeamId === final.teamAId ? final.teamBId : final.teamAId;
    const finalResult = `${Math.max(final.result.setsA, final.result.setsB)}x${Math.min(final.result.setsA, final.result.setsB)}`;
    if (!champion || champion.championTeamId !== championTeamId || champion.runnerUpTeamId !== runnerUpTeamId || champion.finalResult !== finalResult) {
      plan.steps.push({ type: "record-champion", championTeamId, runnerUpTeamId, finalResult });
    }
    const target = thirdPlace?.result ? PHASE_FINISHED : PHASE_KNOCKOUT;
    if (phase !== target) plan.steps.push({ type: "set-phase", phase: target });
  } else {
    if (phase !== PHASE_KNOCKOUT) plan.steps.push({ type: "set-phase", phase: PHASE_KNOCKOUT });
    if (champion) plan.anomalies.push("O histórico já tem campeão para esta edição, mas a final não tem placar.");
  }
  return plan;
}

/** Resposta de GET /api/bracket/status: situação do mata-mata e da edição, só leitura. */
export interface KnockoutStatus {
  /** current_phase da edição: "Fase de Grupos", "Mata-mata" ou "Campeonato Finalizado". */
  phase: string;
  groupStage: GroupStageStatus;
  pendingTieGroups: GroupId[];
  bracketGenerated: boolean;
  /** Final e disputa de 3º lugar decididas e campeão registrado: jogadores não lançam nem editam mais nada. */
  editionFinished: boolean;
  /** Campeão registrado no histórico: preenchido assim que a final termina, mesmo antes do 3º lugar. */
  champion: { teamId: string; teamName: string } | null;
  runnerUp: { teamId: string; teamName: string } | null;
  finalResult: string | null;
  /** Há avanço automático por concluir (a próxima consulta de GET /api/bracket conclui). */
  syncPending: boolean;
  anomalies: string[];
}
