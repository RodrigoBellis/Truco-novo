export interface GroupMatchPair {
  teamAId: string;
  teamBId: string;
  order: number;
}

/** Gera todos os confrontos de um turno único (todos contra todos) para um grupo de 6 duplas. */
export function generateGroupMatches(teamIds: string[]): GroupMatchPair[] {
  const pairs: GroupMatchPair[] = [];
  let order = 0;

  for (let i = 0; i < teamIds.length; i += 1) {
    for (let j = i + 1; j < teamIds.length; j += 1) {
      pairs.push({ teamAId: teamIds[i], teamBId: teamIds[j], order });
      order += 1;
    }
  }

  return pairs;
}
