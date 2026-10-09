import type { MatchResult } from "@truco/shared";
import { store } from "../data/store.js";
import { resolveBracketProgression } from "./bracketService.js";
import { planResultChange } from "./resultChangePlan.js";

export class MatchError extends Error {}

const VALID_SCORES = new Set(["2-0", "2-1", "1-2", "0-2"]);

export async function recordResult(championshipId: string, matchId: string, result: MatchResult, actorId: string): Promise<void> {
  const match = await store.getMatch(matchId);
  if (!match) throw new MatchError("Jogo não encontrado.");
  if (match.championshipId !== championshipId) throw new MatchError("A partida não pertence à edição em andamento.");

  const key = `${result.setsA}-${result.setsB}`;
  if (!VALID_SCORES.has(key)) {
    throw new MatchError("Placar inválido. Utilize 2x0, 2x1, 1x2 ou 0x2.");
  }

  const bracket = await store.listBracketMatches(championshipId);
  const knockoutMatches = match.stage === "mata-mata" ? await store.listMatches(championshipId, { stage: "mata-mata" }) : [];
  const plan = planResultChange(match, result, bracket, knockoutMatches);
  if (plan.blocked) throw new MatchError(plan.blocked);

  await store.saveMatchResult({
    championshipId,
    matchId,
    result,
    actorId,
  });

  // A fase de grupos não gera o mata-mata sozinha: quem confirma a classificação final e
  // cria o chaveamento é o administrador (POST /bracket/generate). Até lá um placar digitado
  // errado ainda pode ser corrigido.
  if (match.stage === "mata-mata") {
    if (plan.repair) await store.setMatchTeam(plan.repair.matchId, plan.repair.side, plan.repair.teamId);
    // Vencedor de repescagem corrigido: as quartas ainda sem placar são desfeitas e a
    // progressão abaixo decide o cruzamento de novo.
    for (const pendingId of plan.rebuildQuarterfinals) await store.deletePendingKnockoutMatch(pendingId);
    await resolveBracketProgression(championshipId);
  }
}
