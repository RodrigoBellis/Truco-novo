import type { HistoryEntry, Match, Team } from "@truco/shared";
import { store } from "../../data/simulationStore.js";

export interface TournamentOutcome {
  finalMatch: Match;
  championTeam: Team;
  runnerUpTeam: Team;
  finalScore: string;
}

/** Localiza o resultado da final já disputada. Retorna null enquanto o campeonato não terminou. */
export function findTournamentOutcome(): TournamentOutcome | null {
  const finalBracket = store.bracketMatches.find((b) => b.round === "final");
  if (!finalBracket?.matchId) return null;

  const finalMatch = store.matches.find((m) => m.id === finalBracket.matchId);
  if (!finalMatch?.result) return null;

  const championId = finalMatch.result.setsA > finalMatch.result.setsB ? finalMatch.teamAId : finalMatch.teamBId;
  const runnerUpId = championId === finalMatch.teamAId ? finalMatch.teamBId : finalMatch.teamAId;

  const championTeam = store.getTeam(championId);
  const runnerUpTeam = store.getTeam(runnerUpId);
  if (!championTeam || !runnerUpTeam) return null;

  const championScore = Math.max(finalMatch.result.setsA, finalMatch.result.setsB);
  const runnerUpScore = Math.min(finalMatch.result.setsA, finalMatch.result.setsB);

  return {
    finalMatch,
    championTeam,
    runnerUpTeam,
    finalScore: `${championScore}x${runnerUpScore}`,
  };
}

function playerNames(team: Team): [string, string] {
  const first = store.players.find((p) => p.id === team.player1Id)?.name ?? "—";
  const second = store.players.find((p) => p.id === team.player2Id)?.name ?? "—";
  return [first, second];
}

/** Credita um título a cada jogador da dupla campeã no ranking individual. */
export function creditTitlesToChampions(team: Team): void {
  [team.player1Id, team.player2Id].forEach((playerId) => {
    const entry = store.ranking.find((r) => r.playerId === playerId);
    if (entry) {
      entry.titles += 1;
      return;
    }

    const player = store.players.find((p) => p.id === playerId);
    if (player) {
      store.ranking.push({ playerId: player.id, playerName: player.name, titles: 1 });
    }
  });
}

/** Registra a edição encerrada no histórico de campeonatos. */
export function registerHistoryEntry(outcome: TournamentOutcome, year: number): HistoryEntry {
  const edition = store.history.length + 1;
  const entry: HistoryEntry = {
    id: `h-edicao-${edition}`,
    edition,
    name: `${edition}ª Copa Truco do Novo`,
    year,
    champions: playerNames(outcome.championTeam),
    runnersUp: playerNames(outcome.runnerUpTeam),
    finalResult: outcome.finalScore,
    notes: `Edição encerrada com vitória de ${outcome.championTeam.name} sobre ${outcome.runnerUpTeam.name}.`,
  };

  store.history.push(entry);
  return entry;
}

/**
 * Encerra o campeonato: credita títulos e arquiva a edição no histórico.
 * Ainda não é chamado pelo fluxo real — hoje é usado pelo modo de simulação e ficará
 * pronto para ser plugado ao encerramento oficial na fase do Supabase.
 */
export function finalizeTournament(year: number): TournamentOutcome | null {
  const outcome = findTournamentOutcome();
  if (!outcome) return null;

  creditTitlesToChampions(outcome.championTeam);
  registerHistoryEntry(outcome, year);
  return outcome;
}
