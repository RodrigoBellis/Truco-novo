/**
 * Sugestão de confrontos para as mesas da fase de grupos.
 *
 * É só SUGESTÃO: a fase de grupos não tem ordem obrigatória e qualquer jogo pode ter o placar
 * lançado a qualquer momento. Nada aqui bloqueia lançamento, muda placar ou classificação.
 *
 * Regra: uma mesa livre recebe um confronto pendente cujas duas duplas não estejam jogando em
 * outra mesa. Entre os possíveis, vem primeiro o que envolve duplas com mais jogos ainda por
 * fazer (para nenhuma dupla virar gargalo no fim) e, no empate, duplas paradas há mais tempo.
 * Com 7 duplas cabem no máximo 3 jogos ao mesmo tempo (6 duplas jogando, 1 descansando).
 */
export interface TableCandidate {
  id: string;
  teamAId: string;
  teamBId: string;
}

export interface SuggestTablesInput<T extends TableCandidate> {
  /** Confrontos ainda sem placar e que não estão em nenhuma mesa. */
  pending: readonly T[];
  /** Duplas jogando agora em alguma mesa. */
  busyTeamIds: ReadonlySet<string> | readonly string[];
  /** Quantas mesas estão livres agora. */
  freeTables: number;
  /** Quando cada dupla terminou o último jogo (qualquer número crescente); quem não jogou vale -Infinity. */
  lastFinishedAt?: ReadonlyMap<string, number>;
}

export function suggestNextMatches<T extends TableCandidate>({ pending, busyTeamIds, freeTables, lastFinishedAt }: SuggestTablesInput<T>): T[] {
  const busy = new Set(busyTeamIds);
  const remaining = new Map<string, number>();
  for (const match of pending) for (const team of [match.teamAId, match.teamBId]) remaining.set(team, (remaining.get(team) ?? 0) + 1);
  const rest = (team: string) => lastFinishedAt?.get(team) ?? -Infinity;

  const chosen: T[] = [];
  const pool = [...pending];
  while (chosen.length < freeTables) {
    const options = pool.filter((match) => !busy.has(match.teamAId) && !busy.has(match.teamBId));
    if (options.length === 0) break;
    options.sort((a, b) =>
      (remaining.get(b.teamAId)! + remaining.get(b.teamBId)!) - (remaining.get(a.teamAId)! + remaining.get(a.teamBId)!)
      || Math.max(rest(a.teamAId), rest(a.teamBId)) - Math.max(rest(b.teamAId), rest(b.teamBId))
      || a.id.localeCompare(b.id));
    const pick = options[0];
    chosen.push(pick);
    busy.add(pick.teamAId);
    busy.add(pick.teamBId);
    pool.splice(pool.indexOf(pick), 1);
  }
  return chosen;
}

// ---------- Rodadas visuais da fase de grupos ----------

export interface GroupRoundTable {
  /** Mesa de referência (1, 2 ou 3). */
  table: number;
  teamAId: string;
  teamBId: string;
}

export interface GroupRound {
  /** 1 a 7. */
  round: number;
  tables: GroupRoundTable[];
  /** Dupla que descansa nesta rodada (null com número par de duplas). */
  restingTeamId: string | null;
}

/**
 * Organização VISUAL da fase de grupos em rodadas, pelo método do círculo: com 7 duplas são 7
 * rodadas de 3 jogos (mesas 1, 2 e 3), cada dupla descansa exatamente uma rodada e enfrenta as
 * outras seis uma vez. É só referência para a organização presencial: nenhum jogo depende da
 * rodada, e os placares podem ser lançados em qualquer ordem.
 *
 * A ordem de entrada define a distribuição; quem chama passa sempre a mesma ordem (por exemplo,
 * as duplas ordenadas pelo nome) para todos verem as mesmas rodadas.
 */
export function buildGroupRounds(teamIds: readonly string[]): GroupRound[] {
  if (teamIds.length < 2) return [];
  const slots: Array<string | null> = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, null];
  const rounds: GroupRound[] = [];
  for (let round = 0; round < slots.length - 1; round += 1) {
    const tables: GroupRoundTable[] = [];
    let restingTeamId: string | null = null;
    for (let index = 0; index < slots.length / 2; index += 1) {
      const first = slots[index];
      const second = slots[slots.length - 1 - index];
      if (first && second) tables.push({ table: 0, teamAId: first, teamBId: second });
      else restingTeamId = first ?? second;
    }
    // A numeração das mesas gira a cada rodada, para nenhuma dupla ficar presa à mesma mesa.
    tables.forEach((table, index) => { table.table = ((index + round) % tables.length) + 1; });
    tables.sort((a, b) => a.table - b.table);
    rounds.push({ round: round + 1, tables, restingTeamId });
    slots.splice(1, 0, slots.pop()!);
  }
  return rounds;
}

/** Chave de um confronto independente do lado: serve para achar o jogo gravado de cada mesa. */
export const pairKey = (teamAId: string, teamBId: string): string => [teamAId, teamBId].sort().join("|");
