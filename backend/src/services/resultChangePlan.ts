// Regra pura (sem banco) para aceitar ou recusar um placar com o mata-mata em andamento.
import type { BracketMatch, Match, MatchResult } from "@truco/shared";

const winnerOf = (match: Pick<Match, "teamAId" | "teamBId">, result: MatchResult) => (result.setsA > result.setsB ? match.teamAId : match.teamBId);

export interface ResultChangePlan {
  /** Motivo para recusar o lançamento/correção; null quando pode gravar. */
  blocked: string | null;
  /** Jogo seguinte, ainda sem placar, que precisa trocar a dupla porque o vencedor mudou. */
  repair: { matchId: string; side: "A" | "B"; teamId: string } | null;
  /**
   * Jogos das quartas, ainda sem placar, a desfazer porque mudou um vencedor da repescagem:
   * o cruzamento das quartas depende dos dois vencedores e precisa ser decidido de novo.
   */
  rebuildQuarterfinals: string[];
}

const allowed: ResultChangePlan = { blocked: null, repair: null, rebuildQuarterfinals: [] };

/**
 * Decide se um placar pode ser gravado sem deixar o mata-mata incoerente. Função pura.
 *
 * - Fase de grupos: depois que o mata-mata foi gerado, a classificação que o originou não
 *   pode mais mudar — nenhum placar de grupo é aceito.
 * - Mata-mata: corrigir o placar mantendo o vencedor é sempre possível. Trocar o vencedor só
 *   é possível enquanto a fase seguinte não tiver placar: nas quartas, semifinais e final a
 *   dupla do jogo seguinte é trocada; na repescagem as quartas são desfeitas e remontadas.
 */
export function planResultChange(match: Match, result: MatchResult, bracket: readonly BracketMatch[], matches: readonly Match[]): ResultChangePlan {
  if (match.stage === "grupos") {
    return bracket.length > 0
      ? { ...allowed, blocked: "O mata-mata já foi gerado a partir da classificação final; os placares da fase de grupos não podem mais ser alterados." }
      : allowed;
  }

  const own = bracket.find((item) => item.matchId === match.id);
  if (!own || !match.result || winnerOf(match, match.result) === winnerOf(match, result)) return allowed;

  if (own.round === "repescagem") {
    const quarters = bracket.filter((item) => item.round === "quartas" && item.matchId)
      .map((item) => ({ item, match: matches.find((candidate) => candidate.id === item.matchId) }));
    const played = quarters.find((quarter) => quarter.match?.result);
    if (played) return { ...allowed, blocked: `Não é possível trocar o vencedor: ${played.item.label} já foi disputada com o cruzamento definido por esta repescagem.` };
    return { ...allowed, rebuildQuarterfinals: quarters.flatMap((quarter) => (quarter.match ? [quarter.match.id] : [])) };
  }

  for (const next of bracket) {
    const side = next.slotA.type === "winner" && next.slotA.bracketMatchId === own.id ? "A" : next.slotB.type === "winner" && next.slotB.bracketMatchId === own.id ? "B" : null;
    if (!side || !next.matchId) continue;
    const nextMatch = matches.find((item) => item.id === next.matchId);
    if (!nextMatch) continue;
    if (nextMatch.result) {
      return { ...allowed, blocked: `Não é possível trocar o vencedor: ${next.label} já foi disputada com a dupla que venceu este confronto.` };
    }
    return { ...allowed, repair: { matchId: nextMatch.id, side, teamId: winnerOf(match, result) } };
  }
  return allowed;
}
