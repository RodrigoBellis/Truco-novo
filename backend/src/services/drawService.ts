import type { GroupId } from "@truco/shared";
import { store } from "../data/store.js";
import { shuffle } from "../utils/shuffle.js";
import type { RandomFn } from "../utils/seededRandom.js";
import { generateGroupMatches } from "./groupMatchesService.js";

export class DrawError extends Error {}

/**
 * Realiza o sorteio das duplas aprovadas, mantendo as cabeças de chave sempre em grupos distintos.
 * O gerador aleatório é injetável apenas para permitir simulações determinísticas — o fluxo
 * real continua usando Math.random.
 */
export async function performDraw(championshipId: string, random: RandomFn = Math.random): Promise<void> {
  const approved = await store.approvedTeams(championshipId);
  if (approved.length < 2) {
    throw new DrawError("É necessário ter duplas aprovadas para realizar o sorteio.");
  }

  const seeded = shuffle(approved.filter((t) => t.seeded), random);
  const others = shuffle(approved.filter((t) => !t.seeded), random);

  const capacity = Math.ceil(approved.length / 2);
  const assignments: Record<GroupId, string[]> = { A: [], B: [] };

  seeded.forEach((team, index) => {
    const groupId: GroupId = index % 2 === 0 ? "A" : "B";
    assignments[groupId].push(team.id);
  });

  others.forEach((team) => {
    const groupId: GroupId = assignments.A.length < capacity && assignments.A.length <= assignments.B.length ? "A" : "B";
    assignments[groupId].push(team.id);
  });

  await store.clearMatchesAndBracket(championshipId);
  await store.assignTeamsToGroups(assignments, championshipId);

  for (const groupId of ["A", "B"] as const) {
    const pairs = generateGroupMatches(assignments[groupId]);
    await store.createGroupMatches(championshipId, groupId, pairs);
  }

  await store.setDrawStatus(championshipId, "realizado");
  await store.setCurrentPhase(championshipId, "Fase de Grupos");
}
