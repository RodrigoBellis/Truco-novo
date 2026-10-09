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
