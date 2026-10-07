export type GroupId = "A" | "B";

export type TeamStatus = "pendente" | "aprovada";

export interface Team {
  id: string;
  name: string;
  player1Id: string;
  player2Id: string;
  status: TeamStatus;
  seeded: boolean;
  isPlaceholder: boolean;
  groupId: GroupId | null;
  strength: number;
}

export function isValidTeamStrength(strength: number): boolean {
  return Number.isInteger(strength) && strength >= 1 && strength <= 5;
}

/**
 * Formato definitivo da 5ª edição: dois grupos de seis duplas (12 no total), todos contra
 * todos dentro do grupo. Backend, telas e validações leem daqui; o banco repete o mesmo
 * limite em truco_fn_teams_per_group() (migration 202610070001).
 */
export const EDITION_GROUP_IDS = ["A", "B"] as const satisfies readonly GroupId[];
export const TEAMS_PER_GROUP = 6;
export const EDITION_TEAM_COUNT = TEAMS_PER_GROUP * EDITION_GROUP_IDS.length;
export const MATCHES_PER_TEAM = TEAMS_PER_GROUP - 1;
export const MATCHES_PER_GROUP = (TEAMS_PER_GROUP * MATCHES_PER_TEAM) / 2;

export type QualificationZone = "semifinal" | "repescagem" | "eliminado";

/** 1º vai direto à semifinal, o último do grupo é eliminado e os demais vão à repescagem. */
export function qualificationForPosition(position: number, teamsInGroup = TEAMS_PER_GROUP): QualificationZone {
  if (!Number.isInteger(position) || position < 1 || position > teamsInGroup) {
    throw new RangeError(`A posição deve estar entre 1 e ${teamsInGroup}.`);
  }
  if (position === 1) return "semifinal";
  if (position < teamsInGroup) return "repescagem";
  return "eliminado";
}
