import type { Team } from "@truco/shared";
import { apiRequest } from "./api";

export function getTeams(): Promise<Team[]> {
  return apiRequest<Team[]>("/teams");
}

export function approveTeam(teamId: string): Promise<Team> {
  return apiRequest<Team>(`/teams/${teamId}/approve`, { method: "POST" });
}

export function rejectTeam(teamId: string): Promise<void> {
  return apiRequest<void>(`/teams/${teamId}/reject`, { method: "POST" });
}

export function renameTeam(teamId: string, name: string): Promise<Team> {
  return apiRequest<Team>(`/teams/${teamId}`, { method: "PATCH", body: { name } });
}
