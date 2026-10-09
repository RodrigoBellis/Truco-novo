import type { MatchResult } from "@truco/shared";
import { store } from "../../data/simulationStore.js";
import { resolveBracketProgression } from "./bracketService.js";

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

  // Mesma regra do campeonato real: o mata-mata nasce sozinho quando a fase de grupos fecha
  // sem empate pendente (empate absoluto espera a decisão do administrador) e cada fase
  // encerrada abre a seguinte.
  resolveBracketProgression();
}
