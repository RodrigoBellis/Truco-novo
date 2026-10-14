export type GroupId = "A";

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
 * Formato definitivo da 5ª edição (14/10/2026): sete duplas num grupo único, todos contra
 * todos (21 jogos). O grupo continua gravado como "A" no banco; na tela ele é o "Grupo Único".
 * Backend, telas e validações leem daqui.
 */
export const EDITION_GROUP_IDS = ["A"] as const satisfies readonly GroupId[];
export const TEAMS_PER_GROUP = 7;
export const EDITION_TEAM_COUNT = TEAMS_PER_GROUP * EDITION_GROUP_IDS.length;
export const MATCHES_PER_TEAM = TEAMS_PER_GROUP - 1;
export const MATCHES_PER_GROUP = (TEAMS_PER_GROUP * MATCHES_PER_TEAM) / 2;
export const SINGLE_GROUP_NAME = "Grupo Único";

/** Nome do grupo para a tela: com um grupo só, "Grupo Único". */
export function groupDisplayName(groupId: GroupId | null | undefined): string {
  return EDITION_GROUP_IDS.length === 1 || !groupId ? SINGLE_GROUP_NAME : `Grupo ${groupId}`;
}

export type QualificationZone = "semifinal" | "quartas" | "eliminado";

export const QUALIFICATION_ZONES = ["semifinal", "quartas", "eliminado"] as const satisfies readonly QualificationZone[];

export const QUALIFICATION_ZONE_LABEL: Record<QualificationZone, string> = {
  semifinal: "Semifinal",
  quartas: "Quartas",
  eliminado: "Eliminado",
};

/**
 * Destino de cada posição: 1º e 2º direto na semifinal, 3º a 6º nas quartas de final e o
 * último (7º) eliminado.
 */
export function qualificationForPosition(position: number, teamsInGroup = TEAMS_PER_GROUP): QualificationZone {
  if (!Number.isInteger(position) || position < 1 || position > teamsInGroup) {
    throw new RangeError(`A posição deve estar entre 1 e ${teamsInGroup}.`);
  }
  if (position === teamsInGroup) return "eliminado";
  if (position <= 2) return "semifinal";
  return "quartas";
}
