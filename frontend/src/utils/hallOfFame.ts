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

const SUITS = ["♠", "♥", "♣", "♦"] as const;

/** Naipe gravado na taça de cada edição. */
export function editionSuit(edition: number) {
  return SUITS[(edition - 1) % SUITS.length];
}

/** Nome da dupla; edições antigas sem integrantes registrados não viram "— & —". */
export function duoLabel(duo: [string, string]): string {
  return duo.every((name) => name === "—") ? "Dupla não registrada" : duo.join(" & ");
}

/** Um capítulo da linha do tempo do Hall da Fama: edição encerrada ou a edição em disputa. */
export type EditionChapter =
  | { kind: "closed"; edition: number; entry: HistoryEntry }
  | { kind: "open"; edition: number };

/**
 * Capítulos em ordem cronológica (1ª → última encerrada). A edição em disputa vira o último
 * capítulo quando ainda não está no histórico e vem depois de todas as encerradas; ela nunca
 * carrega campeão. Nenhum número de edição é fixo: o histórico crescendo, a lista cresce.
 */
export function buildEditionChapters(editions: HistoryEntry[], currentEdition: number | null | undefined): EditionChapter[] {
  const chapters: EditionChapter[] = [...editions]
    .sort((a, b) => a.edition - b.edition)
    .map((entry) => ({ kind: "closed", edition: entry.edition, entry }));
  const last = chapters.at(-1)?.edition ?? 0;
  if (typeof currentEdition === "number" && Number.isInteger(currentEdition) && currentEdition > last) {
    chapters.push({ kind: "open", edition: currentEdition });
  }
  return chapters;
}

/** Há ao menos um integrante registrado na dupla? */
export function hasRegisteredDuo(duo: [string, string]): boolean {
  return duo.some((name) => name !== "—");
}
