import type { BracketMatch, BracketSlotSource, Match } from "@truco/shared";
import { store } from "../../data/simulationStore.js";
import { nextId } from "../../utils/id.js";
import { computeStandings, isGroupComplete } from "./standingsService.js";

export class BracketError extends Error {}

function direct(teamId: string): BracketSlotSource {
  return { type: "direct", teamId };
}

function winnerOf(bracketMatchId: string): BracketSlotSource {
  return { type: "winner", bracketMatchId };
}

function positionLabel(position: number): string {
  return `${position}º`;
}

export function generateBracket(): void {
  if (!isGroupComplete("A") || !isGroupComplete("B")) {
    throw new BracketError("A fase de grupos precisa estar concluída em ambos os grupos.");
  }

  const standingsA = computeStandings("A");
  const standingsB = computeStandings("B");
  const byPosition = (rows: typeof standingsA, position: number) => {
    const row = rows.find((r) => r.position === position);
    if (!row) throw new BracketError(`Posição ${position} não encontrada.`);
    return row.teamId;
  };

  const teamOf = (group: "A" | "B", position: number) => byPosition(group === "A" ? standingsA : standingsB, position);

  const o1: BracketMatch = { id: nextId("bracket"), round: "oitavas", order: 0, label: "2ºA x 5ºB", slotA: direct(teamOf("A", 2)), slotB: direct(teamOf("B", 5)), matchId: null };
  const o2: BracketMatch = { id: nextId("bracket"), round: "oitavas", order: 1, label: "3ºA x 4ºB", slotA: direct(teamOf("A", 3)), slotB: direct(teamOf("B", 4)), matchId: null };
  const o3: BracketMatch = { id: nextId("bracket"), round: "oitavas", order: 2, label: "4ºA x 3ºB", slotA: direct(teamOf("A", 4)), slotB: direct(teamOf("B", 3)), matchId: null };
  const o4: BracketMatch = { id: nextId("bracket"), round: "oitavas", order: 3, label: "5ºA x 2ºB", slotA: direct(teamOf("A", 5)), slotB: direct(teamOf("B", 2)), matchId: null };

  const q1: BracketMatch = { id: nextId("bracket"), round: "quartas", order: 0, label: "Vencedor 2ºAx5ºB x Vencedor 3ºAx4ºB", slotA: winnerOf(o1.id), slotB: winnerOf(o2.id), matchId: null };
  const q2: BracketMatch = { id: nextId("bracket"), round: "quartas", order: 1, label: "Vencedor 4ºAx3ºB x Vencedor 5ºAx2ºB", slotA: winnerOf(o3.id), slotB: winnerOf(o4.id), matchId: null };

  const s1: BracketMatch = { id: nextId("bracket"), round: "semifinal", order: 0, label: `${positionLabel(1)}A x Vencedor Quartas 2`, slotA: direct(teamOf("A", 1)), slotB: winnerOf(q2.id), matchId: null };
  const s2: BracketMatch = { id: nextId("bracket"), round: "semifinal", order: 1, label: `${positionLabel(1)}B x Vencedor Quartas 1`, slotA: direct(teamOf("B", 1)), slotB: winnerOf(q1.id), matchId: null };

  const f1: BracketMatch = { id: nextId("bracket"), round: "final", order: 0, label: "Final", slotA: winnerOf(s1.id), slotB: winnerOf(s2.id), matchId: null };

  store.bracketMatches = [o1, o2, o3, o4, q1, q2, s1, s2, f1];
  store.currentPhase = "Mata-mata";
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

export function resolveBracketProgression(): void {
  store.bracketMatches.forEach((bracketMatch) => {
    if (bracketMatch.matchId) return;

    const teamAId = resolveSlot(bracketMatch.slotA);
    const teamBId = resolveSlot(bracketMatch.slotB);
    if (!teamAId || !teamBId) return;

    const roundLabel: Record<BracketMatch["round"], string> = {
      oitavas: "Mata-mata — Oitavas",
      quartas: "Mata-mata — Quartas",
      semifinal: "Semifinal",
      final: "Final",
    };

    const match: Match = {
      id: nextId("match"),
      championshipId: "simulation",
      stage: "mata-mata",
      round: roundLabel[bracketMatch.round],
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
