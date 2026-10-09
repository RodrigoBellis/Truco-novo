import { isEditionFinished, type UserRole } from "@truco/shared";

export function canRecordMatchResult(role: UserRole | null, playerTeamId: string | null, teamAId: string, teamBId: string): boolean {
  if (role === "admin" || role === "superadmin") return true;
  return role === "jogador" && Boolean(playerTeamId) && (playerTeamId === teamAId || playerTeamId === teamBId);
}

export function canRecordEditionResult(role: UserRole | null, actorPlayerId: string | null, matchPlayerIds: string[], belongsToCurrentEdition: boolean): boolean {
  if (!belongsToCurrentEdition) return false;
  if (role === "admin" || role === "superadmin") return true;
  return role === "jogador" && actorPlayerId !== null && matchPlayerIds.includes(actorPlayerId);
}

/**
 * Cadeado global de resultados: com ele fechado só administradores gravam placar. Jogador não
 * cria nem corrige resultado, mesmo sendo integrante da partida.
 */
export function resultsLockBlocks(role: UserRole | null, locked: boolean): boolean {
  return locked && role !== "admin" && role !== "superadmin";
}

/**
 * Edição encerrada (campeão registrado): jogador não lança nem edita mais nada; o
 * administrador ainda pode corrigir.
 */
export function editionFinishedBlocks(role: UserRole | null, phase: string | null | undefined): boolean {
  return isEditionFinished(phase) && role !== "admin" && role !== "superadmin";
}
