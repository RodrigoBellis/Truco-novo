import type { MatchResult } from "@truco/shared";
import { store } from "../data/store.js";
import { isGroupComplete } from "./standingsService.js";
import { generateBracket, resolveBracketProgression, BracketError } from "./bracketService.js";

export class MatchError extends Error {}

const VALID_SCORES = new Set(["2-0", "2-1", "1-2", "0-2"]);

export async function recordResult(championshipId: string, matchId: string, result: MatchResult): Promise<void> {
  const match = await store.getMatch(matchId);
  if (!match) throw new MatchError("Jogo não encontrado.");

  const key = `${result.setsA}-${result.setsB}`;
  if (!VALID_SCORES.has(key)) {
    throw new MatchError("Placar inválido. Utilize 2x0, 2x1, 1x2 ou 0x2.");
  }

  await store.updateMatchResult(matchId, result);

  if (match.stage === "grupos") {
    const bracketMatches = await store.listBracketMatches(championshipId);
    if (bracketMatches.length === 0) {
      if ((await isGroupComplete(championshipId, "A")) && (await isGroupComplete(championshipId, "B"))) {
        try {
          await generateBracket(championshipId);
        } catch (error) {
          if (!(error instanceof BracketError)) throw error;
        }
      }
    }
  } else if (match.stage === "mata-mata") {
    await resolveBracketProgression(championshipId);
  }
}
