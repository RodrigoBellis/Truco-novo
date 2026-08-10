import type { Team } from "@truco/shared";

export function findTeam(teams: Team[], teamId: string | null | undefined): Team | undefined {
  if (!teamId) return undefined;
  return teams.find((team) => team.id === teamId);
}

export function teamLabel(teams: Team[], teamId: string | null | undefined): string {
  return findTeam(teams, teamId)?.name ?? "A definir";
}
