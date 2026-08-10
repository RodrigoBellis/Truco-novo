export interface RankingEntry {
  playerId: string;
  playerName: string;
  titles: number;
}

/** Ranking de duplas campeãs, calculado ao vivo pela RPC truco_rpc_champions_ranking. */
export interface ChampionRankingEntry {
  teamKey: string;
  teamName: string;
  playerNames: string[];
  titles: number;
  runnerUps: number;
  participations: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRatePct: number;
}

/** Uma edição já encerrada do campeonato. */
export interface HistoryEntry {
  id: string;
  edition: number;
  name: string;
  year: number;
  champions: [string, string];
  /** Nulo quando o vice não foi registrado nas edições antigas. */
  runnersUp: [string, string] | null;
  /** Nulo quando o placar da final não foi registrado. */
  finalResult: string | null;
  notes: string;
}

export interface HallOfFame {
  editions: HistoryEntry[];
  currentEdition: number;
  currentYear: number;
}
