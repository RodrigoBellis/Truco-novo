import { EDITION_GROUP_IDS, type GroupId } from "@truco/shared";
import { store } from "../data/store.js";
import { shuffle } from "../utils/shuffle.js";
import type { RandomFn } from "../utils/seededRandom.js";
import { generateGroupMatches } from "./groupMatchesService.js";

export class DrawError extends Error {}

/**
 * Realiza o sorteio das duplas aprovadas: com o grupo único, sorteia só a ordem dos confrontos.
 * O gerador aleatório é injetável apenas para permitir simulações determinísticas — o fluxo
 * real continua usando Math.random.
 */
export async function performDraw(championshipId: string, random: RandomFn = Math.random): Promise<void> {
  const approved = await store.approvedTeams(championshipId);
  if (approved.length < 2) {
    throw new DrawError("É necessário ter duplas aprovadas para realizar o sorteio.");
  }

  // Grupo único: todas as duplas aprovadas vão para o mesmo grupo, em ordem sorteada.
  const assignments = { A: shuffle(approved, random).map((team) => team.id) } satisfies Record<GroupId, string[]>;

  await store.clearMatchesAndBracket(championshipId);
  await store.assignTeamsToGroups(assignments, championshipId);

  for (const groupId of EDITION_GROUP_IDS) {
    const pairs = generateGroupMatches(assignments[groupId]);
    await store.createGroupMatches(championshipId, groupId, pairs);
  }

  await store.setDrawStatus(championshipId, "realizado");
  await store.setCurrentPhase(championshipId, "Fase de Grupos");
}
