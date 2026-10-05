import type { Match, MatchResult, MatchStage } from "@truco/shared";
import { apiRequest } from "./api";

interface MatchFilters {
  stage?: MatchStage;
  groupId?: string;
  teamId?: string;
}

export function getMatches(filters: MatchFilters = {}): Promise<Match[]> {
  const params = new URLSearchParams();
  if (filters.stage) params.set("stage", filters.stage);
  if (filters.groupId) params.set("groupId", filters.groupId);
  if (filters.teamId) params.set("teamId", filters.teamId);
  const query = params.toString();
  return apiRequest<Match[]>(`/matches${query ? `?${query}` : ""}`);
}

export function recordMatchResult(matchId: string, result: MatchResult): Promise<Match> {
  return apiRequest<Match>(`/matches/${matchId}/result`, { method: "POST", body: result });
}

export interface MatchResultAuditEntry {
  id: string;
  matchId: string | null;
  actorId: string | null;
  actorName: string;
  action: string;
  createdAt: string;
  metadata: { previous?: MatchResult | null; next?: MatchResult };
}

export function getMatchResultAudit(): Promise<MatchResultAuditEntry[]> {
  return apiRequest<MatchResultAuditEntry[]>("/matches/audit");
}
