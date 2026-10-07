import type { Group, GroupId, StandingRow } from "@truco/shared";
import { apiRequest } from "./api";

export function getGroups(): Promise<Group[]> {
  return apiRequest<Group[]>("/groups");
}

export function getStandings(groupId: GroupId): Promise<StandingRow[]> {
  return apiRequest<StandingRow[]>(`/groups/${groupId}/standings`);
}

export function generateGroupFixtures(): Promise<{ matchesCreated: number }> {
  return apiRequest<{ matchesCreated: number }>("/groups/generate-matches", { method: "POST" });
}

/** Cria só os confrontos que faltam para duplas que entraram depois da geração dos jogos. */
export function completeGroupFixtures(): Promise<{ matchesCreated: number }> {
  return apiRequest<{ matchesCreated: number }>("/groups/complete-matches", { method: "POST" });
}
