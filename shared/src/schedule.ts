import type { GroupId } from "./team.js";

/**
 * Mesas (1-3) são só um detalhe interno do escalonador (schedulerService), usado para
 * distribuir/balancear os jogos. O jogador nunca vê "mesa" — só a ordem da fila. Isso evita
 * o bug de mostrar a mesma dupla como "jogando agora" em duas mesas ao mesmo tempo: as mesas
 * não avançam em sincronia real (uma pode ficar várias partidas atrás da outra), então
 * "atual por mesa" podia exibir 2 jogos da mesma dupla simultaneamente. Com fila única e
 * sequencial só existe UM próximo jogo por vez.
 */
export type TableNumber = 1 | 2 | 3;

/** Um jogo da fila — nomes resolvidos no frontend via getTeams(), igual ao resto do app. */
export interface QueueMatch {
  matchId: string;
  /** Posição na fila (1 = próximo jogo a ser disputado). */
  order: number;
  groupId: GroupId | null;
  teamAId: string;
  teamBId: string;
  result: { setsA: number; setsB: number } | null;
  status: "pendente" | "realizado";
}

export interface MatchQueue {
  items: QueueMatch[];
}

export type QueueStatus = "aguardando" | "prepare-se" | "proximo-jogo" | "em-jogo" | "finalizado";

export interface MyQueueStatus {
  status: QueueStatus;
  opponentTeamId: string | null;
  matchesAhead: number | null;
}
