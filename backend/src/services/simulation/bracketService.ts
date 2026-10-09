import { BRACKET_ROUND_LABEL, buildKnockoutBracket, settleQuarterfinals, type BracketSlotSource, type GroupId, type Match, type QuarterfinalPairing } from "@truco/shared";
import { store } from "../../data/simulationStore.js";
import { nextId } from "../../utils/id.js";
import { computeStandings, isGroupComplete } from "./standingsService.js";

export class BracketError extends Error {}

/** Gera o mata-mata do simulador pelo mesmo plano oficial do campeonato real (KNOCKOUT_PLAN). */
export function generateBracket(): void {
  if (!isGroupComplete("A") || !isGroupComplete("B")) {
    throw new BracketError("A fase de grupos precisa estar concluída em ambos os grupos.");
  }

  const standings = { A: computeStandings("A"), B: computeStandings("B") };
  const pending = (["A", "B"] as const).filter((groupId) => standings[groupId].some((row) => row.tiePending));
  if (pending.length > 0) {
    throw new BracketError(`Há empate sem critério de desempate no Grupo ${pending.join(" e no Grupo ")}.`);
  }

  try {
    store.bracketMatches = buildKnockoutBracket(
      (group: GroupId, position: number) => standings[group].find((row) => row.position === position)?.teamId,
      () => nextId("bracket"),
    );
  } catch (error) {
    throw new BracketError(error instanceof Error ? error.message : "Classificação incompleta.");
  }
  store.currentPhase = "Mata-mata";
  quarterfinalPairing = null;
  resolveBracketProgression();
}

function resolveSlot(slot: BracketSlotSource): string | null {
  if (slot.type === "direct") return slot.teamId;
  if (slot.type === "tbd") return null;

  const source = store.bracketMatches.find((b) => b.id === slot.bracketMatchId);
  if (!source || !source.matchId) return null;

  const match = store.matches.find((m) => m.id === source.matchId);
  if (!match || !match.result) return null;

  return match.result.setsA > match.result.setsB ? match.teamAId : match.teamBId;
}

/** Cruzamento escolhido para as quartas na simulação em curso (null até as repescagens terminarem). */
export let quarterfinalPairing: QuarterfinalPairing | null = null;

export function resolveBracketProgression(): void {
  // Mesma regra do campeonato real: quartas só com as duas repescagens encerradas.
  const quartersCreated = store.bracketMatches.some((item) => item.round === "quartas" && item.matchId);
  let quartersReady = quartersCreated;
  if (!quartersCreated) {
    const settlement = settleQuarterfinals(store.bracketMatches, store.matches, (teamId) => store.getTeam(teamId)?.groupId);
    if (settlement) {
      settlement.slots.forEach(({ bracketMatchId, slotB }) => {
        store.bracketMatches.find((item) => item.id === bracketMatchId)!.slotB = slotB;
      });
      quarterfinalPairing = settlement.pairing;
      quartersReady = true;
    }
  }

  store.bracketMatches.forEach((bracketMatch) => {
    if (bracketMatch.matchId) return;
    if (bracketMatch.round === "quartas" && !quartersReady) return;

    const teamAId = resolveSlot(bracketMatch.slotA);
    const teamBId = resolveSlot(bracketMatch.slotB);
    if (!teamAId || !teamBId) return;

    const match: Match = {
      id: nextId("match"),
      championshipId: "simulation",
      stage: "mata-mata",
      round: BRACKET_ROUND_LABEL[bracketMatch.round],
      order: bracketMatch.order,
      groupId: null,
      teamAId,
      teamBId,
      result: null,
      status: "pendente",
      tableNumber: null,
      blockNumber: null,
      queuePosition: null,
    };

    store.matches.push(match);
    bracketMatch.matchId = match.id;
  });

  const finalMatch = store.bracketMatches.find((b) => b.round === "final");
  if (finalMatch?.matchId) {
    const match = store.matches.find((m) => m.id === finalMatch.matchId);
    if (match?.result) {
      store.currentPhase = "Campeonato Finalizado";
    }
  }
}
