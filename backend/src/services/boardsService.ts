import type { Match, MatchQueue, MyQueueStatus, QueueMatch, QueueStatus } from "@truco/shared";
import { store } from "../data/store.js";

function toQueueMatch(match: Match, order: number): QueueMatch {
  return {
    matchId: match.id,
    order,
    groupId: match.groupId,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    result: match.result,
    status: match.status,
  };
}

/**
 * Fila única de jogos pendentes, em ordem — "Jogo 1", "Jogo 2", ... Mesa (1-3) é só um
 * detalhe interno do escalonador (schedulerService), usado para balancear a ordem entre os
 * grupos; não aparece aqui. Mostrar "atual por mesa" foi removido de propósito: como as 3
 * mesas não avançam em sincronia real, essa visão podia listar a mesma dupla como "jogando
 * agora" em duas mesas ao mesmo tempo. Com fila única isso é estruturalmente impossível —
 * só existe um "jogo 1" no sistema inteiro.
 */
export function buildMatchQueue(matches: Match[], limit = 30): MatchQueue {
  const pending = matches
    .filter((m) => m.status === "pendente" && m.queuePosition !== null)
    .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
    .slice(0, limit);

  return { items: pending.map((match, index) => toQueueMatch(match, index + 1)) };
}

/**
 * Status da dupla do jogador na fila global (não mais por mesa). "matchesAhead" conta todos
 * os jogos pendentes de QUALQUER mesa que vêm antes do jogo da própria dupla — é a mesma fila
 * que "Ordem dos Jogos" mostra, então o número aqui bate exatamente com aquela tela.
 */
export function buildMyQueueStatus(matches: Match[], myTeamId: string | null): MyQueueStatus {
  if (!myTeamId) {
    return { status: "aguardando", opponentTeamId: null, matchesAhead: null };
  }

  const myPending = matches
    .filter((m) => m.status === "pendente" && (m.teamAId === myTeamId || m.teamBId === myTeamId))
    .sort((a, b) => (a.queuePosition ?? Number.MAX_SAFE_INTEGER) - (b.queuePosition ?? Number.MAX_SAFE_INTEGER));

  const nextMatch = myPending[0];
  if (!nextMatch || nextMatch.queuePosition === null) {
    return { status: "finalizado", opponentTeamId: null, matchesAhead: null };
  }

  const matchesAhead = matches.filter(
    (m) => m.status === "pendente" && (m.queuePosition ?? Number.MAX_SAFE_INTEGER) < (nextMatch.queuePosition ?? 0),
  ).length;

  let status: QueueStatus = "aguardando";
  if (matchesAhead === 0) status = "em-jogo";
  else if (matchesAhead === 1) status = "proximo-jogo";
  else if (matchesAhead === 2) status = "prepare-se";

  const opponentTeamId = nextMatch.teamAId === myTeamId ? nextMatch.teamBId : nextMatch.teamAId;

  return { status, opponentTeamId, matchesAhead };
}

export async function getMatchQueueForChampionship(championshipId: string): Promise<MatchQueue> {
  const matches = await store.listMatches(championshipId, { stage: "grupos" });
  return buildMatchQueue(matches);
}

export async function getMyQueueStatus(championshipId: string, playerId: string): Promise<MyQueueStatus> {
  const myTeamId = await store.getTeamIdForPlayer(playerId);
  const matches = await store.listMatches(championshipId, { stage: "grupos" });
  return buildMyQueueStatus(matches, myTeamId);
}
