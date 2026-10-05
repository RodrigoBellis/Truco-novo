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

export type QualificationZone = "semifinal" | "repescagem" | "eliminado";

export function qualificationForPosition(position: number): QualificationZone {
  if (!Number.isInteger(position) || position < 1 || position > 5) throw new RangeError("A posição deve estar entre 1 e 5.");
  if (position === 1) return "semifinal";
  if (position <= 4) return "repescagem";
  return "eliminado";
}
