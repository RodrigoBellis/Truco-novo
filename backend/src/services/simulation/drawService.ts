import type { GroupId } from "@truco/shared";
import { store } from "../../data/simulationStore.js";
import { shuffle } from "../../utils/shuffle.js";
import type { RandomFn } from "../../utils/seededRandom.js";
import { generateGroupMatches } from "./groupMatchesService.js";

export class DrawError extends Error {}

/**
 * Realiza o sorteio das duplas aprovadas, mantendo as cabeças de chave sempre em grupos distintos.
 * O gerador aleatório é injetável apenas para permitir simulações determinísticas — o fluxo real
 * continua usando Math.random.
 */
export function performDraw(random: RandomFn = Math.random): void {
  const approved = store.approvedTeams();
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

  (["A", "B"] as const).forEach((groupId) => {
    const group = store.getGroup(groupId);
    group.teamIds = assignments[groupId];
    assignments[groupId].forEach((teamId) => {
      const team = store.getTeam(teamId);
      if (team) team.groupId = groupId;
    });
  });

  store.matches = [
    ...generateGroupMatches("A", assignments.A),
    ...generateGroupMatches("B", assignments.B),
  ];
  store.bracketMatches = [];
  store.drawStatus = "realizado";
  store.currentPhase = "Fase de Grupos";
}
