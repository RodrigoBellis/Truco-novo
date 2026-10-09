import { pointsForResult, type Match } from "./match.js";
import type { GroupId } from "./team.js";

export interface Group {
  id: GroupId;
  name: string;
  teamIds: string[];
}

export interface StandingRow {
  position: number;
  teamId: string;
  jogos: number;
  vitorias: number;
  /** Vitórias por 2x0 — terceiro critério (segundo desempate). */
  vitorias2x0: number;
  derrotas: number;
  pontos: number;
  /** Saldo de quedas (sets vencidos menos sets perdidos) — quinto critério. */
  saldoSets: number;
  /**
   * Confronto direto — quarto critério: vitórias desta dupla nos jogos contra as duplas com
   * quem ela está empatada em pontos, vitórias e vitórias por 2x0. Zero para quem não está
   * empatado com ninguém nesses três.
   */
  confrontoDireto: number;
  /**
   * Grupo encerrado e esta dupla continua empatada com outra depois de todos os critérios
   * (pontos, vitórias, 2x0, confronto direto e saldo de quedas), sem decisão do administrador.
   * A posição mostrada é provisória.
   */
  tiePending: boolean;
}

/** Ordem oficial da classificação, para legendas e mensagens. */
export const STANDINGS_CRITERIA = ["pontos", "vitórias", "vitórias por 2x0", "confronto direto", "saldo de quedas"] as const;

const tieKey = (row: StandingRow) => [row.pontos, row.vitorias, row.vitorias2x0, row.confrontoDireto, row.saldoSets].join("|");

/**
 * Empates exatos que esperam decisão: cada item é um conjunto de duplas iguais em todos os
 * critérios, na ordem (provisória) em que aparecem na tabela.
 */
export function pendingTieClusters(rows: readonly StandingRow[]): StandingRow[][] {
  const clusters = new Map<string, StandingRow[]>();
  for (const row of rows) {
    if (!row.tiePending) continue;
    clusters.set(tieKey(row), [...(clusters.get(tieKey(row)) ?? []), row]);
  }
  return [...clusters.values()];
}

/** Decisão manual do administrador para um empate exato: a posição final de uma dupla no grupo. */
export interface StandingOverride {
  teamId: string;
  position: number;
}

/**
 * Classificação de um grupo, nesta ordem:
 *   1. pontos (3/2/1/0);
 *   2. número de vitórias;
 *   3. número de vitórias por 2x0;
 *   4. confronto direto — entre as duplas iguais nos três primeiros, quem venceu mais jogos
 *      disputados entre elas (com duas duplas, é quem ganhou o jogo entre as duas; com três ou
 *      mais, é a "mini-tabela" só desses jogos);
 *   5. saldo de quedas na fase de grupos inteira.
 * Um empate que sobreviva aos cinco só se resolve pela decisão do administrador (overrides)
 * e, até lá, fica marcado como pendente quando o grupo termina. O confronto direto é aplicado
 * uma vez, sobre o conjunto empatado nos três primeiros critérios; não é recalculado depois
 * que o saldo separa parte desse conjunto.
 *
 * Função pura: o campeonato real e o simulador isolado calculam a tabela por aqui.
 */
export function computeGroupStandings(
  teamIds: readonly string[],
  matches: ReadonlyArray<Pick<Match, "teamAId" | "teamBId" | "result">>,
  overrides: readonly StandingOverride[] = [],
): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    teamIds.map((teamId) => [teamId, { position: 0, teamId, jogos: 0, vitorias: 0, vitorias2x0: 0, derrotas: 0, pontos: 0, saldoSets: 0, confrontoDireto: 0, tiePending: false }]),
  );

  for (const match of matches) {
    const { result } = match;
    const rowA = rows.get(match.teamAId);
    const rowB = rows.get(match.teamBId);
    if (!result || !rowA || !rowB) continue;

    const sides = [
      { row: rowA, setsFor: result.setsA, setsAgainst: result.setsB, isTeamA: true },
      { row: rowB, setsFor: result.setsB, setsAgainst: result.setsA, isTeamA: false },
    ];
    for (const { row, setsFor, setsAgainst, isTeamA } of sides) {
      row.jogos += 1;
      row.pontos += pointsForResult(result, isTeamA);
      row.saldoSets += setsFor - setsAgainst;
      if (setsFor > setsAgainst) {
        row.vitorias += 1;
        if (setsAgainst === 0) row.vitorias2x0 += 1;
      } else {
        row.derrotas += 1;
      }
    }
  }

  // Critérios 1 a 3 e, dentro de cada conjunto empatado neles, o confronto direto.
  const primaryKey = (row: StandingRow) => [row.pontos, row.vitorias, row.vitorias2x0].join("|");
  const byPrimary = new Map<string, StandingRow[]>();
  for (const row of rows.values()) byPrimary.set(primaryKey(row), [...(byPrimary.get(primaryKey(row)) ?? []), row]);
  for (const cluster of byPrimary.values()) {
    if (cluster.length < 2) continue;
    const members = new Set(cluster.map((row) => row.teamId));
    for (const match of matches) {
      if (!match.result || !members.has(match.teamAId) || !members.has(match.teamBId)) continue;
      const winnerId = match.result.setsA > match.result.setsB ? match.teamAId : match.teamBId;
      rows.get(winnerId)!.confrontoDireto += 1;
    }
  }

  const criteria = (a: StandingRow, b: StandingRow) =>
    b.pontos - a.pontos || b.vitorias - a.vitorias || b.vitorias2x0 - a.vitorias2x0 || b.confrontoDireto - a.confrontoDireto || b.saldoSets - a.saldoSets;
  const resolved = new Map(overrides.map((override) => [override.teamId, override.position]));
  const seedOrder = new Map(teamIds.map((teamId, index) => [teamId, index]));

  const sorted = [...rows.values()].sort((a, b) => {
    const byCriteria = criteria(a, b);
    if (byCriteria !== 0) return byCriteria;
    const positionA = resolved.get(a.teamId);
    const positionB = resolved.get(b.teamId);
    if (positionA !== undefined && positionB !== undefined && positionA !== positionB) return positionA - positionB;
    return seedOrder.get(a.teamId)! - seedOrder.get(b.teamId)!;
  });

  const gamesPerTeam = teamIds.length - 1;
  const groupComplete = teamIds.length > 1 && sorted.every((row) => row.jogos === gamesPerTeam);

  sorted.forEach((row, index) => {
    row.position = index + 1;
    if (!groupComplete) return;
    // Pendente enquanto o administrador não tiver dado posições distintas a todo o empate.
    row.tiePending = sorted.some((other) => {
      if (other === row || criteria(row, other) !== 0) return false;
      const mine = resolved.get(row.teamId);
      const theirs = resolved.get(other.teamId);
      return mine === undefined || theirs === undefined || mine === theirs;
    });
  });

  return sorted;
}
