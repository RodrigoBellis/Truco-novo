import type { BracketMatch, BracketSlotSource } from "@truco/shared";
import { store } from "../data/store.js";
import { computeStandings, isGroupComplete } from "./standingsService.js";

export class BracketError extends Error {}

function direct(teamId: string): BracketSlotSource {
  return { type: "direct", teamId };
}

function winnerOf(bracketMatchId: string): BracketSlotSource {
  return { type: "winner", bracketMatchId };
}

export async function generateBracket(championshipId: string): Promise<void> {
  if (!(await isGroupComplete(championshipId, "A")) || !(await isGroupComplete(championshipId, "B"))) {
    throw new BracketError("A fase de grupos precisa estar concluída em ambos os grupos.");
  }

  const standingsA = await computeStandings(championshipId, "A");
  const standingsB = await computeStandings(championshipId, "B");
  const byPosition = (rows: typeof standingsA, position: number) => {
    const row = rows.find((r) => r.position === position);
    if (!row) throw new BracketError(`Posição ${position} não encontrada.`);
    return row.teamId;
  };
  const teamOf = (group: "A" | "B", position: number) => byPosition(group === "A" ? standingsA : standingsB, position);

  const id = () => store.newId();
  const o1 = id();
  const o2 = id();
  const q1 = id();
  const q2 = id();
  const s1 = id();
  const s2 = id();
  const f1 = id();

  /**
   * Grupos de 5 duplas: 1º avança direto à semifinal, 5º é eliminado (não joga mais nada) e
   * 2º/3º/4º disputam a repescagem pelas 2 vagas restantes na semifinal. Como só restam 3
   * disputantes por grupo (6 no total, não 8), o 2º colocado de cada grupo entra com um "bye"
   * na repescagem — só o 3º e o 4º se enfrentam na primeira rodada. O cruzamento A/B evita que
   * duplas do mesmo grupo se encontrem antes da semifinal.
   */
  const rows: Array<{
    id: string;
    round: BracketMatch["round"];
    label: string;
    order: number;
    slotA: BracketSlotSource;
    slotB: BracketSlotSource;
  }> = [
    { id: o1, round: "oitavas", order: 0, label: "3ºA x 4ºB", slotA: direct(teamOf("A", 3)), slotB: direct(teamOf("B", 4)) },
    { id: o2, round: "oitavas", order: 1, label: "4ºA x 3ºB", slotA: direct(teamOf("A", 4)), slotB: direct(teamOf("B", 3)) },
    { id: q1, round: "quartas", order: 0, label: "2ºB x Vencedor 3ºAx4ºB", slotA: direct(teamOf("B", 2)), slotB: winnerOf(o1) },
    { id: q2, round: "quartas", order: 1, label: "2ºA x Vencedor 4ºAx3ºB", slotA: direct(teamOf("A", 2)), slotB: winnerOf(o2) },
    { id: s1, round: "semifinal", order: 0, label: "1ºA x Vencedor Quartas 1", slotA: direct(teamOf("A", 1)), slotB: winnerOf(q1) },
    { id: s2, round: "semifinal", order: 1, label: "1ºB x Vencedor Quartas 2", slotA: direct(teamOf("B", 1)), slotB: winnerOf(q2) },
    { id: f1, round: "final", order: 0, label: "Final", slotA: winnerOf(s1), slotB: winnerOf(s2) },
  ];

  await store.createBracketMatches(championshipId, rows);
  await store.setCurrentPhase(championshipId, "Mata-mata");
  await resolveBracketProgression(championshipId);
}

function resolveSlot(slot: BracketSlotSource, bracketMatches: BracketMatch[], matches: Awaited<ReturnType<typeof loadMatches>>): string | null {
  if (slot.type === "direct") return slot.teamId;
  if (slot.type === "tbd") return null;

  const source = bracketMatches.find((b) => b.id === slot.bracketMatchId);
  if (!source || !source.matchId) return null;

  const match = matches.find((m) => m.id === source.matchId);
  if (!match || !match.result) return null;

  return match.result.setsA > match.result.setsB ? match.teamAId : match.teamBId;
}

async function loadMatches(championshipId: string) {
  return [...(await store.listMatches(championshipId, { stage: "grupos" })), ...(await store.listMatches(championshipId, { stage: "mata-mata" }))];
}

const ROUND_LABEL: Record<BracketMatch["round"], string> = {
  oitavas: "Mata-mata — Oitavas",
  quartas: "Mata-mata — Quartas",
  semifinal: "Semifinal",
  final: "Final",
};

export async function resolveBracketProgression(championshipId: string): Promise<void> {
  const bracketMatches = await store.listBracketMatches(championshipId);
  const matches = await loadMatches(championshipId);

  for (const bracketMatch of bracketMatches) {
    if (bracketMatch.matchId) continue;

    const teamAId = resolveSlot(bracketMatch.slotA, bracketMatches, matches);
    const teamBId = resolveSlot(bracketMatch.slotB, bracketMatches, matches);
    if (!teamAId || !teamBId) continue;

    const match = await store.createMatch({
      championshipId,
      stage: "mata-mata",
      round: ROUND_LABEL[bracketMatch.round],
      order: bracketMatch.order,
      teamAId,
      teamBId,
    });
    await store.linkBracketMatch(bracketMatch.id, match.id);
  }

  const finalBracket = bracketMatches.find((b) => b.round === "final");
  if (finalBracket?.matchId) {
    const match = await store.getMatch(finalBracket.matchId);
    if (match?.result) {
      await store.setCurrentPhase(championshipId, "Campeonato Finalizado");
    }
  }
}
