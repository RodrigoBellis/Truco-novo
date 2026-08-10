import type { DashboardChampion, DashboardStats } from "@truco/shared";
import { store } from "../data/store.js";

async function findChampion(championshipId: string): Promise<DashboardChampion | null> {
  const bracketMatches = await store.listBracketMatches(championshipId);
  const finalBracketMatch = bracketMatches.find((b) => b.round === "final");
  if (!finalBracketMatch?.matchId) return null;

  const match = await store.getMatch(finalBracketMatch.matchId);
  if (!match?.result) return null;

  const winnerId = match.result.setsA > match.result.setsB ? match.teamAId : match.teamBId;
  const team = await store.getTeam(winnerId);
  if (!team) return null;

  return { teamId: team.id, teamName: team.name };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const championship = await store.getCurrentChampionship();
  const [players, teams, matches, champion] = await Promise.all([
    store.listPlayers(),
    store.listTeams(championship.truco_id),
    store.listMatches(championship.truco_id),
    findChampion(championship.truco_id),
  ]);

  const totalPlayers = players.filter((p) => p.role === "jogador").length;
  const totalTeams = teams.length;
  const pendingApprovals = teams.filter((t) => t.status === "pendente").length;
  const approvedTeams = teams.filter((t) => t.status === "aprovada").length;
  const matchesPlayed = matches.filter((m) => m.status === "realizado").length;
  const matchesPending = matches.filter((m) => m.status === "pendente").length;

  const nextMatches = matches
    .filter((m) => m.status === "pendente")
    .sort((a, b) => a.order - b.order)
    .slice(0, 5);

  return {
    totalPlayers,
    totalTeams,
    pendingApprovals,
    approvedTeams,
    drawStatus: championship.draw_status,
    matchesPlayed,
    matchesPending,
    currentPhase: championship.current_phase,
    nextMatches,
    champion,
  };
}
