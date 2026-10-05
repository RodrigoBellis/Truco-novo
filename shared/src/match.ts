import type { GroupId } from "./team.js";

export type MatchStage = "grupos" | "mata-mata";
export type MatchStatus = "pendente" | "realizado";

export interface MatchResult {
  setsA: number;
  setsB: number;
}

export interface Match {
  id: string;
  championshipId: string;
  stage: MatchStage;
  round: string;
  order: number;
  groupId: GroupId | null;
  teamAId: string;
  teamBId: string;
  result: MatchResult | null;
  status: MatchStatus;
  /** Mesa (1-3) atribuída pelo escalonamento automático. Só existe na fase de grupos. */
  tableNumber: number | null;
  /** Bloco de até 3 jogos simultâneos ao qual esta partida pertence. */
  blockNumber: number | null;
  /** Posição global na fila — usada para calcular "quantos jogos faltam" e o jogo atual de cada mesa. */
  queuePosition: number | null;
}

export function pointsForResult(result: MatchResult, isTeamA: boolean): number {
  const won = isTeamA ? result.setsA > result.setsB : result.setsB > result.setsA;
  const sets = isTeamA ? [result.setsA, result.setsB] : [result.setsB, result.setsA];
  const [setsFor, setsAgainst] = sets;

  if (won && setsFor === 2 && setsAgainst === 0) return 3;
  if (won && setsFor === 2 && setsAgainst === 1) return 2;
  if (!won && setsFor === 1 && setsAgainst === 2) return 1;
  return 0;
}
