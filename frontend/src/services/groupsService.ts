import type { Group, GroupId, StandingRow } from "@truco/shared";
import { apiRequest } from "./api";

export function getGroups(): Promise<Group[]> {
  return apiRequest<Group[]>("/groups");
}

export function getStandings(groupId: GroupId): Promise<StandingRow[]> {
  return apiRequest<StandingRow[]>(`/groups/${groupId}/standings`);
}
