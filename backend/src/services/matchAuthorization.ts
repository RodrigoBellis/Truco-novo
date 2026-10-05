import type { UserRole } from "@truco/shared";

export function canRecordMatchResult(role: UserRole | null, playerTeamId: string | null, teamAId: string, teamBId: string): boolean {
  if (role === "admin" || role === "superadmin") return true;
  return role === "jogador" && Boolean(playerTeamId) && (playerTeamId === teamAId || playerTeamId === teamBId);
}

export function canRecordEditionResult(role: UserRole | null, actorPlayerId: string | null, matchPlayerIds: string[], belongsToCurrentEdition: boolean): boolean {
  if (!belongsToCurrentEdition) return false;
  if (role === "admin" || role === "superadmin") return true;
  return role === "jogador" && actorPlayerId !== null && matchPlayerIds.includes(actorPlayerId);
}
