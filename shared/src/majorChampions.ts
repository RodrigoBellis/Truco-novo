export interface MajorChampionEntry {
  /** Stable identity derived from the two player IDs, independent of member order. */
  key: string;
  players: [string, string];
  name: string;
  titles: number;
  editions: number[];
  /** Competition ranking: equal title counts share a position. */
  rank: number;
}

export interface MajorChampionTeamPair {
  teamId: string;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
}

export interface HistoricalTeamTitle {
  teamId: string | null;
  edition: number;
}

function pairKey(player1Id: string, player2Id: string): string {
  return [player1Id, player2Id].sort((a, b) => a.localeCompare(b)).join("::");
}

/** Aggregate history by the two stable player IDs; team member order never changes identity. */
export function buildMajorChampions(
  teamPairs: MajorChampionTeamPair[],
  historicalTitles: HistoricalTeamTitle[],
): MajorChampionEntry[] {
  const pairByTeamId = new Map(teamPairs.map((pair) => [pair.teamId, pair]));
  const grouped = new Map<string, Omit<MajorChampionEntry, "rank">>();
  const countedTitles = new Set<string>();

  for (const pair of teamPairs) {
    const key = pairKey(pair.player1Id, pair.player2Id);
    if (!grouped.has(key)) {
      const players = [pair.player1Name, pair.player2Name].sort((a, b) => a.localeCompare(b, "pt-BR")) as [string, string];
      grouped.set(key, { key, players, name: `${players[0]} & ${players[1]}`, titles: 0, editions: [] });
    }
  }

  for (const title of historicalTitles) {
    if (!title.teamId) continue;
    const pair = pairByTeamId.get(title.teamId);
    if (!pair) continue;
    const key = pairKey(pair.player1Id, pair.player2Id);
    const entry = grouped.get(key);
    const editionKey = `${key}::${title.edition}`;
    if (!entry || countedTitles.has(editionKey)) continue;
    countedTitles.add(editionKey);
    entry.titles += 1;
    entry.editions.push(title.edition);
  }

  const sorted = [...grouped.values()]
    .map((entry) => ({ ...entry, editions: entry.editions.sort((a, b) => a - b) }))
    .sort((a, b) => b.titles - a.titles || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

  let previousTitles: number | null = null;
  let currentRank = 0;
  return sorted.map((entry, index) => {
    if (entry.titles !== previousTitles) currentRank = index + 1;
    previousTitles = entry.titles;
    return { ...entry, rank: currentRank };
  });
}
