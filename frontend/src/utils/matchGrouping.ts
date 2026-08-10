import type { Match } from "@truco/shared";

export interface MatchGroup {
  round: string;
  matches: Match[];
}

export function groupMatchesByRound(matches: Match[]): MatchGroup[] {
  const sorted = [...matches].sort((a, b) => a.order - b.order);
  const groups: MatchGroup[] = [];

  sorted.forEach((match) => {
    const existing = groups.find((group) => group.round === match.round);
    if (existing) {
      existing.matches.push(match);
    } else {
      groups.push({ round: match.round, matches: [match] });
    }
  });

  return groups;
}
