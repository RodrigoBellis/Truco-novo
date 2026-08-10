import type { Match } from "./match.js";

export type DrawStatus = "pendente" | "realizado";

export interface DashboardChampion {
  teamId: string;
  teamName: string;
}

export interface DashboardStats {
  totalPlayers: number;
  totalTeams: number;
  pendingApprovals: number;
  approvedTeams: number;
  drawStatus: DrawStatus;
  matchesPlayed: number;
  matchesPending: number;
  currentPhase: string;
  nextMatches: Match[];
  champion: DashboardChampion | null;
}
