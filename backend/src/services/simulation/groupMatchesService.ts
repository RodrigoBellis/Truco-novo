import type { GroupId, Match } from "@truco/shared";
import { nextId } from "../../utils/id.js";

/** Gera todos os confrontos de um turno único (todos contra todos) para um grupo de 6 duplas. */
export function generateGroupMatches(groupId: GroupId, teamIds: string[]): Match[] {
  const matches: Match[] = [];
  let order = 0;

  for (let i = 0; i < teamIds.length; i += 1) {
    for (let j = i + 1; j < teamIds.length; j += 1) {
      matches.push({
        id: nextId("match"),
        stage: "grupos",
        round: `Grupo ${groupId}`,
        order,
        groupId,
        teamAId: teamIds[i],
        teamBId: teamIds[j],
        result: null,
        status: "pendente",
        tableNumber: null,
        blockNumber: null,
        queuePosition: null,
      });
      order += 1;
    }
  }

  return matches;
}
