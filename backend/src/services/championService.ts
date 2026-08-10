import type { Match, Team } from "@truco/shared";
import { store } from "../data/store.js";

export interface TournamentOutcome {
  finalMatch: Match;
  championTeam: Team;
  runnerUpTeam: Team;
  finalScore: string;
}

/** Localiza o resultado da final já disputada. Retorna null enquanto o campeonato não terminou. */
export async function findTournamentOutcome(championshipId: string): Promise<TournamentOutcome | null> {
  const bracketMatches = await store.listBracketMatches(championshipId);
  const finalBracket = bracketMatches.find((b) => b.round === "final");
  if (!finalBracket?.matchId) return null;

  const finalMatch = await store.getMatch(finalBracket.matchId);
  if (!finalMatch?.result) return null;

  const championId = finalMatch.result.setsA > finalMatch.result.setsB ? finalMatch.teamAId : finalMatch.teamBId;
  const runnerUpId = championId === finalMatch.teamAId ? finalMatch.teamBId : finalMatch.teamAId;

  const [championTeam, runnerUpTeam] = await Promise.all([store.getTeam(championId), store.getTeam(runnerUpId)]);
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

/**
 * Registra a edição encerrada no histórico de campeonatos. O ranking de campeões é derivado
 * ao vivo (truco_rpc_champions_ranking / store.listRanking) a partir do histórico — não existe
 * mais um contador solto de títulos para creditar manualmente, então essa é a única gravação
 * necessária para o campeão passar a valer no ranking.
 */
export async function registerHistoryEntry(
  championshipId: string,
  edition: number,
  name: string,
  year: number,
  outcome: TournamentOutcome,
) {
  await store.addHistoryEntry({
    championshipId,
    edition,
    name,
    year,
    championTeamId: outcome.championTeam.id,
    runnerUpTeamId: outcome.runnerUpTeam.id,
    finalResult: outcome.finalScore,
    notes: `Edição encerrada com vitória de ${outcome.championTeam.name} sobre ${outcome.runnerUpTeam.name}.`,
  });
}

/**
 * Encerra o campeonato: arquiva a edição no histórico (o ranking reflete o novo título
 * automaticamente, por ser derivado). Ainda não é chamado pelo fluxo real — usado hoje só
 * pelo modo de simulação (em seu próprio store isolado) e pelo encerramento oficial futuro.
 */
export async function finalizeTournament(championshipId: string, year: number): Promise<TournamentOutcome | null> {
  const outcome = await findTournamentOutcome(championshipId);
  if (!outcome) return null;

  const championship = await store.getCurrentChampionship();
  await registerHistoryEntry(championshipId, championship.edition, championship.name, year, outcome);
  await store.setCurrentPhase(championshipId, "Campeonato Finalizado");
  return outcome;
}
