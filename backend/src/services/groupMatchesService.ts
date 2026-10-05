export interface GroupMatchPair {
  teamAId: string;
  teamBId: string;
  order: number;
}

/** Gera os confrontos em turno único para um grupo (10 jogos com 5 duplas). */
export function generateGroupMatches(teamIds: string[]): GroupMatchPair[] {
  if (teamIds.length !== 5) throw new RangeError("A fase de grupos exige exatamente 5 duplas por grupo.");
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
