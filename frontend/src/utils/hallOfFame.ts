import type { HistoryEntry } from "@truco/shared";

/** Estatísticas de uma dupla derivadas do histórico de edições (sem tocar no ranking individual do backend). */
export interface ChampionDupla {
  key: string;
  players: [string, string];
  name: string;
  titles: number;
  runnerUps: number;
  editions: number[];
  lastTitleYear: number | null;
  winRate: number;
}

function pairKey(a: string, b: string): string {
  return [a, b].map((name) => name.trim().toLowerCase()).sort().join("::");
}

/** Agrupa o histórico de edições por dupla, contando títulos e vice-campeonatos. */
export function buildChampionDuplas(editions: HistoryEntry[]): ChampionDupla[] {
  const byKey = new Map<string, ChampionDupla>();

  const upsert = (pair: [string, string]): ChampionDupla => {
    const key = pairKey(pair[0], pair[1]);
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        key,
        players: pair,
        name: `${pair[0]} & ${pair[1]}`,
        titles: 0,
        runnerUps: 0,
        editions: [],
        lastTitleYear: null,
        winRate: 0,
      };
      byKey.set(key, entry);
    }
    return entry;
  };

  for (const edition of editions) {
    const champion = upsert(edition.champions);
    champion.titles += 1;
    champion.editions.push(edition.edition);
    champion.lastTitleYear = champion.lastTitleYear === null ? edition.year : Math.max(champion.lastTitleYear, edition.year);

    if (edition.runnersUp) {
      upsert(edition.runnersUp).runnerUps += 1;
    }
  }

  return [...byKey.values()]
    .map((entry) => ({
      ...entry,
      winRate: entry.titles + entry.runnerUps > 0 ? Math.round((entry.titles / (entry.titles + entry.runnerUps)) * 100) : 0,
    }))
    .sort((a, b) => b.titles - a.titles || b.winRate - a.winRate || a.name.localeCompare(b.name));
}

export interface HallOfFameStats {
  totalEditions: number;
  totalChampionDuplas: number;
  totalFinalsParticipants: number;
}

export function buildHallOfFameStats(editions: HistoryEntry[], duplas: ChampionDupla[]): HallOfFameStats {
  return {
    totalEditions: editions.length,
    totalChampionDuplas: duplas.filter((dupla) => dupla.titles > 0).length,
    totalFinalsParticipants: duplas.length,
  };
}
