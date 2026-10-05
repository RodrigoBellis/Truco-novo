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

export type TeamParticipationInput = Pick<Team, "name" | "player1Id" | "player2Id" | "groupId" | "strength">;

export function saveTeamParticipation(input: TeamParticipationInput, teamId?: string): Promise<Team> {
  return apiRequest<Team>(teamId ? `/teams/${teamId}` : "/teams", {
    method: teamId ? "PATCH" : "POST",
    body: input,
  });
}

export function setTeamParticipationStatus(teamId: string, status: Team["status"]): Promise<Team> {
  return apiRequest<Team>(`/teams/${teamId}/status`, { method: "PATCH", body: { status } });
}
