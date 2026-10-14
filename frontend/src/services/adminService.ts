import type { Group, Team, DrawStatus, ResultsLockState } from "@truco/shared";
import { apiRequest } from "./api";

interface DrawResult {
  groups: Group[];
  teams: Team[];
  drawStatus: DrawStatus;
}

export function runDraw(): Promise<DrawResult> {
  return apiRequest<DrawResult>("/admin/sorteio", { method: "POST" });
}

export function resetTournament(): Promise<void> {
  return apiRequest<void>("/admin/reset", { method: "POST" });
}

/** Abre ou fecha o cadeado global de resultados (somente administradores). */
export function setResultsLock(locked: boolean): Promise<ResultsLockState> {
  return apiRequest<ResultsLockState>("/admin/results-lock", { method: "POST", body: { locked } });
}

export interface PlayerAccess { playerId: string; hasAccount: boolean; setupPending: boolean; setupCompletedAt: string | null }

/** Situação de acesso de cada jogador (nunca a senha). */
export function getPlayersAccess(): Promise<PlayerAccess[]> {
  return apiRequest<PlayerAccess[]>("/admin/players/access");
}

/** "Redefinir acesso": a senha atual deixa de valer e o jogador cria outra na próxima entrada. */
export function resetPlayerAccess(playerId: string): Promise<{ playerId: string; playerName: string; accountCreated: boolean }> {
  return apiRequest(`/admin/players/${encodeURIComponent(playerId)}/reset-access`, { method: "POST" });
}

/** Reinicia o acesso de todos os participantes da edição (só com o cadeado de resultados fechado). */
export function restartAllAccess(): Promise<{ restarted: number; created: number }> {
  return apiRequest("/admin/access/restart", { method: "POST" });
}
