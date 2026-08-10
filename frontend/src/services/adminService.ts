import type { Group, Team, DrawStatus } from "@truco/shared";
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
