import { MATCHES_PER_GROUP, TEAMS_PER_GROUP, type Match } from "@truco/shared";

export interface GroupMatchPair {
  teamAId: string;
  teamBId: string;
  order: number;
}

/** Gera os confrontos em turno único para um grupo completo (15 jogos com 6 duplas). */
export function generateGroupMatches(teamIds: string[]): GroupMatchPair[] {
  if (teamIds.length !== TEAMS_PER_GROUP) {
    throw new RangeError(`A fase de grupos exige exatamente ${TEAMS_PER_GROUP} duplas por grupo.`);
  }
  return missingGroupMatches(teamIds, []);
}

const pairKey = (first: string, second: string) => [first, second].sort().join("::");

/**
 * Confrontos de turno único que ainda não existem no grupo — usado quando duplas novas entram
 * depois que os jogos já foram gerados. Os jogos existentes (realizados ou não) ficam como
 * estão; os novos recebem ordem depois da maior ordem já usada no grupo.
 */
export function missingGroupMatches(teamIds: string[], existing: Pick<Match, "teamAId" | "teamBId" | "order">[]): GroupMatchPair[] {
  const members = new Set(teamIds);
  const outsider = existing.find((match) => !members.has(match.teamAId) || !members.has(match.teamBId));
  if (outsider) throw new RangeError("Há jogo do grupo com dupla que não pertence mais a ele; revise os grupos antes de completar os confrontos.");

  const played = new Set(existing.map((match) => pairKey(match.teamAId, match.teamBId)));
  if (played.size !== existing.length) throw new RangeError("Há confronto repetido no grupo.");

  const pairs: GroupMatchPair[] = [];
  let order = existing.reduce((max, match) => Math.max(max, match.order + 1), 0);
  for (let i = 0; i < teamIds.length; i += 1) {
    for (let j = i + 1; j < teamIds.length; j += 1) {
      if (played.has(pairKey(teamIds[i], teamIds[j]))) continue;
      pairs.push({ teamAId: teamIds[i], teamBId: teamIds[j], order });
      order += 1;
    }
  }
  if (existing.length + pairs.length > MATCHES_PER_GROUP) throw new RangeError(`Um grupo tem no máximo ${MATCHES_PER_GROUP} jogos.`);
  return pairs;
}

export interface GroupCompletionPlan {
  /** Confrontos novos, já com a ordem final no grupo. */
  created: GroupMatchPair[];
  /** Jogos pendentes existentes que mudam de ordem. Jogos realizados nunca aparecem aqui. */
  reordered: Array<{ matchId: string; order: number }>;
}

/**
 * Completa um grupo que ganhou dupla depois da geração dos jogos. Só criar os confrontos no fim
 * da ordem deixaria a dupla nova jogando seguido no fim da fila; por isso os jogos ainda
 * pendentes do grupo (os antigos e os novos) são intercalados para espalhar os de cada dupla.
 * As posições de ordem usadas são as mesmas que já eram dos pendentes mais as novas — jogos
 * realizados mantêm ordem, placar e status.
 */
export function planGroupCompletion(teamIds: string[], existing: Match[]): GroupCompletionPlan {
  const missing = missingGroupMatches(teamIds, existing);
  if (missing.length === 0) return { created: [], reordered: [] };

  const pending = existing.filter((match) => match.status === "pendente").sort((a, b) => a.order - b.order);
  const slots = [...pending.map((match) => match.order), ...missing.map((pair) => pair.order)].sort((a, b) => a - b);
  const sequence = spreadByTeam([
    ...pending.map((match) => ({ matchId: match.id as string | null, previousOrder: match.order, teamAId: match.teamAId, teamBId: match.teamBId })),
    ...missing.map((pair) => ({ matchId: null, previousOrder: pair.order, teamAId: pair.teamAId, teamBId: pair.teamBId })),
  ]);

  const plan: GroupCompletionPlan = { created: [], reordered: [] };
  sequence.forEach((item, index) => {
    const order = slots[index];
    if (item.matchId === null) plan.created.push({ teamAId: item.teamAId, teamBId: item.teamBId, order });
    else if (item.previousOrder !== order) plan.reordered.push({ matchId: item.matchId, order });
  });
  return plan;
}

/** Ordem que evita a mesma dupla em dois jogos seguidos e adianta quem tem mais jogos por fazer. */
function spreadByTeam<T extends { teamAId: string; teamBId: string }>(items: T[]): T[] {
  const remaining = new Map<string, number>();
  for (const item of items) for (const teamId of [item.teamAId, item.teamBId]) remaining.set(teamId, (remaining.get(teamId) ?? 0) + 1);

  const pool = [...items];
  const sequence: T[] = [];
  let previous = new Set<string>();
  while (pool.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    pool.forEach((item, index) => {
      const rested = !previous.has(item.teamAId) && !previous.has(item.teamBId);
      const score = (rested ? 100 : 0) + remaining.get(item.teamAId)! + remaining.get(item.teamBId)!;
      // Empate fica com o que já vinha antes na ordem.
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });
    const [picked] = pool.splice(bestIndex, 1);
    sequence.push(picked);
    for (const teamId of [picked.teamAId, picked.teamBId]) remaining.set(teamId, remaining.get(teamId)! - 1);
    previous = new Set([picked.teamAId, picked.teamBId]);
  }
  return sequence;
}
