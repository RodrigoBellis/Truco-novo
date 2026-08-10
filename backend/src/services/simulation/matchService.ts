import type { MatchResult } from "@truco/shared";
import { store } from "../../data/simulationStore.js";
import { isGroupComplete } from "./standingsService.js";
import { generateBracket, resolveBracketProgression, BracketError } from "./bracketService.js";

export class MatchError extends Error {}

const VALID_SCORES = new Set(["2-0", "2-1", "1-2", "0-2"]);

export function recordResult(matchId: string, result: MatchResult): void {
  const match = store.matches.find((m) => m.id === matchId);
  if (!match) throw new MatchError("Jogo não encontrado.");

  const key = `${result.setsA}-${result.setsB}`;
  if (!VALID_SCORES.has(key)) {
    throw new MatchError("Placar inválido. Utilize 2x0, 2x1, 1x2 ou 0x2.");
  }

  match.result = result;
  match.status = "realizado";

  if (match.stage === "grupos" && store.bracketMatches.length === 0) {
    if (isGroupComplete("A") && isGroupComplete("B")) {
      try {
        generateBracket();
      } catch (error) {
        if (!(error instanceof BracketError)) throw error;
      }
    }
  } else if (match.stage === "mata-mata") {
    resolveBracketProgression();
  }
}
