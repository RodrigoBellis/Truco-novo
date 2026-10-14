import { store } from "../../data/simulationStore.js";
import { shuffle } from "../../utils/shuffle.js";
import type { RandomFn } from "../../utils/seededRandom.js";
import { generateGroupMatches } from "./groupMatchesService.js";

export class DrawError extends Error {}

/**
 * Realiza o sorteio das duplas aprovadas: com o grupo único, sorteia a ordem dos confrontos.
 * O gerador aleatório é injetável apenas para permitir simulações determinísticas — o fluxo real
 * continua usando Math.random.
 */
export function performDraw(random: RandomFn = Math.random): void {
  const approved = store.approvedTeams();
  if (approved.length < 2) {
    throw new DrawError("É necessário ter duplas aprovadas para realizar o sorteio.");
  }

  // Grupo único: todas as duplas aprovadas no mesmo grupo, em ordem sorteada.
  const teamIds = shuffle(approved, random).map((team) => team.id);
  const group = store.getGroup("A");
  group.teamIds = teamIds;
  teamIds.forEach((teamId) => {
    const team = store.getTeam(teamId);
    if (team) team.groupId = "A";
  });

  store.matches = generateGroupMatches("A", teamIds);
  store.bracketMatches = [];
  store.drawStatus = "realizado";
  store.currentPhase = "Fase de Grupos";
}
