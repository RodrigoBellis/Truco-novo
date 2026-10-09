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
 * Formato definitivo da 5ª edição: dois grupos de cinco duplas (10 no total), todos contra
 * todos dentro do grupo. Backend, telas e validações leem daqui.
 */
export const EDITION_GROUP_IDS = ["A", "B"] as const satisfies readonly GroupId[];
export const TEAMS_PER_GROUP = 5;
export const EDITION_TEAM_COUNT = TEAMS_PER_GROUP * EDITION_GROUP_IDS.length;
export const MATCHES_PER_TEAM = TEAMS_PER_GROUP - 1;
export const MATCHES_PER_GROUP = (TEAMS_PER_GROUP * MATCHES_PER_TEAM) / 2;

export type QualificationZone = "semifinal" | "quartas" | "repescagem" | "eliminado";

export const QUALIFICATION_ZONES = ["semifinal", "quartas", "repescagem", "eliminado"] as const satisfies readonly QualificationZone[];

export const QUALIFICATION_ZONE_LABEL: Record<QualificationZone, string> = {
  semifinal: "Semifinal",
  quartas: "Quartas",
  repescagem: "Repescagem",
  eliminado: "Eliminado",
};

/**
 * Destino de cada posição do grupo: 1º direto na semifinal, 2º direto nas quartas de final,
 * 3º e 4º na repescagem e o último eliminado.
 */
export function qualificationForPosition(position: number, teamsInGroup = TEAMS_PER_GROUP): QualificationZone {
  if (!Number.isInteger(position) || position < 1 || position > teamsInGroup) {
    throw new RangeError(`A posição deve estar entre 1 e ${teamsInGroup}.`);
  }
  if (position === 1) return "semifinal";
  if (position === teamsInGroup) return "eliminado";
  if (position === 2) return "quartas";
  return "repescagem";
}
