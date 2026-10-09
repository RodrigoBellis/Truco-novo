import { BRACKET_ROUND_LABEL, buildKnockoutBracket, settleQuarterfinals, type BracketMatch, type BracketSlotSource, type GroupId } from "@truco/shared";
import { store } from "../data/store.js";
import { computeStandings, isGroupComplete } from "./standingsService.js";

export class BracketError extends Error {}

/**
 * Gera o mata-mata da edição a partir das classificações finais, seguindo KNOCKOUT_PLAN
 * (@truco/shared): repescagem, quartas de final, semifinais e final.
 */
export async function generateBracket(championshipId: string): Promise<void> {
  if (!(await isGroupComplete(championshipId, "A")) || !(await isGroupComplete(championshipId, "B"))) {
    throw new BracketError("A fase de grupos precisa estar concluída em ambos os grupos.");
  }
  if ((await store.listBracketMatches(championshipId)).length > 0) {
    throw new BracketError("O mata-mata desta edição já foi gerado.");
  }

  const standings: Record<GroupId, Awaited<ReturnType<typeof computeStandings>>> = {
    A: await computeStandings(championshipId, "A"),
    B: await computeStandings(championshipId, "B"),
  };
  const pending = (["A", "B"] as const).filter((groupId) => standings[groupId].some((row) => row.tiePending));
  if (pending.length > 0) {
    throw new BracketError(`Há empate sem critério de desempate no Grupo ${pending.join(" e no Grupo ")}: o administrador precisa decidir as posições antes de gerar o mata-mata.`);
  }

  let rows: BracketMatch[];
  try {
    rows = buildKnockoutBracket((group, position) => standings[group].find((row) => row.position === position)?.teamId, () => store.newId());
  } catch (error) {
    throw new BracketError(error instanceof Error ? error.message : "Classificação incompleta.");
  }

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

export async function resolveBracketProgression(championshipId: string): Promise<void> {
  const bracketMatches = await store.listBracketMatches(championshipId);
  const matches = await loadMatches(championshipId);

  // Quartas: só são montadas com as DUAS repescagens encerradas, porque o cruzamento depende
  // de quem venceu — cada 2º colocado pega, se possível, um vencedor do outro grupo.
  const quartersCreated = bracketMatches.some((item) => item.round === "quartas" && item.matchId);
  let quartersReady = quartersCreated;
  if (!quartersCreated) {
    const teams = await store.listTeams(championshipId);
    const settlement = settleQuarterfinals(bracketMatches, matches, (teamId) => teams.find((team) => team.id === teamId)?.groupId);
    if (settlement) {
      for (const { bracketMatchId, slotB } of settlement.slots) {
        const item = bracketMatches.find((candidate) => candidate.id === bracketMatchId)!;
        const changed = item.slotB.type !== "winner" || slotB.type !== "winner" || item.slotB.bracketMatchId !== slotB.bracketMatchId;
        if (changed && slotB.type === "winner") await store.setBracketSlotBSource(bracketMatchId, slotB.bracketMatchId);
        item.slotB = slotB;
      }
      quartersReady = true;
    }
  }

  for (const bracketMatch of bracketMatches) {
    if (bracketMatch.matchId) continue;
    if (bracketMatch.round === "quartas" && !quartersReady) continue;

    const teamAId = resolveSlot(bracketMatch.slotA, bracketMatches, matches);
    const teamBId = resolveSlot(bracketMatch.slotB, bracketMatches, matches);
    if (!teamAId || !teamBId) continue;

    const match = await store.createMatch({
      championshipId,
      stage: "mata-mata",
      round: BRACKET_ROUND_LABEL[bracketMatch.round],
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
