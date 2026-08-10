import type { Match } from "@truco/shared";
import { store } from "../data/store.js";

export interface TableAssignment {
  matchId: string;
  tableNumber: 1 | 2 | 3;
  blockNumber: number;
  queuePosition: number;
}

/**
 * Monta a escala das 3 mesas para a fase de grupos, em blocos de até 3 jogos simultâneos.
 *
 * Regras (pedidas pelo usuário):
 * - Mesa 1 prioriza Grupo A, Mesa 2 prioriza Grupo B.
 * - Mesa 3 é coringa: vai para o grupo com mais jogos pendentes (o "atrasado").
 * - Uma dupla nunca entra em duas mesas no mesmo bloco.
 * - Uma dupla que jogou no bloco anterior só volta a jogar se não houver
 *   alternativa elegível na fila daquele grupo (evita jogos consecutivos).
 * - A fila de cada grupo mantém a ordem original do sorteio (round-robin já
 *   equilibrado); o algoritmo só pula candidatos inelegíveis, nunca reordena
 *   por outro critério — isso preserva o equilíbrio de partidas por dupla.
 *
 * Só decide ORDEM e MESA. Não cria, edita nem apaga partidas, nem toca em
 * resultado/classificação/regras do campeonato.
 */
export function buildSchedule(matches: Match[]): TableAssignment[] {
  const pending = matches.filter((m) => m.stage === "grupos" && m.status === "pendente");
  const alreadyPlayed = matches.filter((m) => m.stage === "grupos" && m.status === "realizado");

  const queueA = pending.filter((m) => m.groupId === "A").sort((a, b) => a.order - b.order);
  const queueB = pending.filter((m) => m.groupId === "B").sort((a, b) => a.order - b.order);

  // Último bloco em que cada dupla jogou (considerando também jogos já realizados,
  // tratados como "bloco -1" — recém-saídos de quadra, então preferimos não
  // escalá-los de novo no bloco 0 se houver alternativa).
  const lastBlockByTeam = new Map<string, number>();
  for (const match of alreadyPlayed) {
    lastBlockByTeam.set(match.teamAId, -1);
    lastBlockByTeam.set(match.teamBId, -1);
  }

  const assignments: TableAssignment[] = [];
  let blockNumber = 0;
  let queuePosition = 1;

  const teamsInvolved = (match: Match): [string, string] => [match.teamAId, match.teamBId];

  /** Acha, na fila, o primeiro jogo cujas duplas não jogaram no bloco anterior
   *  e não estão sendo usadas no bloco atual. Se nenhum servir, cede e usa o
   *  primeiro da fila mesmo assim (jogo consecutivo inevitável). */
  function pickEligible(queue: Match[], blockUsedTeams: Set<string>): Match | null {
    if (queue.length === 0) return null;

    let fallback: Match | null = null;
    for (const candidate of queue) {
      const [a, b] = teamsInvolved(candidate);
      if (blockUsedTeams.has(a) || blockUsedTeams.has(b)) continue; // regra 1: nunca 2 mesas ao mesmo tempo
      if (!fallback) fallback = candidate;
      const restedA = (lastBlockByTeam.get(a) ?? -Infinity) < blockNumber - 1;
      const restedB = (lastBlockByTeam.get(b) ?? -Infinity) < blockNumber - 1;
      if (restedA && restedB) return candidate; // regra 2: descanso de 1 bloco
    }
    return fallback; // nenhuma opção descansada — evita travar a fila
  }

  function takeFromQueue(queue: Match[], match: Match) {
    const index = queue.indexOf(match);
    queue.splice(index, 1);
  }

  function assign(match: Match, tableNumber: 1 | 2 | 3, blockUsedTeams: Set<string>) {
    assignments.push({ matchId: match.id, tableNumber, blockNumber, queuePosition });
    queuePosition += 1;
    const [a, b] = teamsInvolved(match);
    blockUsedTeams.add(a);
    blockUsedTeams.add(b);
    lastBlockByTeam.set(a, blockNumber);
    lastBlockByTeam.set(b, blockNumber);
  }

  while (queueA.length > 0 || queueB.length > 0) {
    const blockUsedTeams = new Set<string>();

    // Mesa 1 — prioridade Grupo A
    const matchTable1 = pickEligible(queueA, blockUsedTeams);
    if (matchTable1) {
      takeFromQueue(queueA, matchTable1);
      assign(matchTable1, 1, blockUsedTeams);
    }

    // Mesa 2 — prioridade Grupo B
    const matchTable2 = pickEligible(queueB, blockUsedTeams);
    if (matchTable2) {
      takeFromQueue(queueB, matchTable2);
      assign(matchTable2, 2, blockUsedTeams);
    }

    // Mesa 3 — coringa: vai para quem está mais atrasado (mais jogos pendentes).
    // Empate desempata para o grupo que NÃO usou a mesa 3 no bloco anterior,
    // pra não virar sempre o mesmo grupo. Como não guardamos isso explicitamente,
    // o critério de "mais pendente" já resolve a alternância na prática, porque
    // o grupo que ganha a mesa 3 fica temporariamente com menos pendências.
    const behindQueue = queueA.length === queueB.length ? (blockNumber % 2 === 0 ? queueA : queueB) : queueA.length > queueB.length ? queueA : queueB;
    const otherQueue = behindQueue === queueA ? queueB : queueA;

    let matchTable3 = pickEligible(behindQueue, blockUsedTeams);
    let sourceQueue = behindQueue;
    if (!matchTable3) {
      matchTable3 = pickEligible(otherQueue, blockUsedTeams);
      sourceQueue = otherQueue;
    }
    if (matchTable3) {
      takeFromQueue(sourceQueue, matchTable3);
      assign(matchTable3, 3, blockUsedTeams);
    }

    // Se nenhuma mesa recebeu jogo neste bloco (só pode acontecer se as filas
    // restantes estão vazias), encerra para não girar em vazio.
    if (!matchTable1 && !matchTable2 && !matchTable3) break;

    blockNumber += 1;
  }

  return assignments;
}

/** Gera a escala e grava table_number/block_number/queue_position no banco. */
export async function generateSchedule(championshipId: string): Promise<TableAssignment[]> {
  const matches = await store.listMatches(championshipId, { stage: "grupos" });
  const assignments = buildSchedule(matches);
  await store.applyScheduleAssignments(assignments);
  return assignments;
}

/** Valida se uma escala não viola a regra 1 (dupla em duas mesas no mesmo bloco). */
export function findConflicts(matches: Match[]): string[] {
  const byBlock = new Map<number, Match[]>();
  for (const match of matches) {
    if (match.blockNumber === null) continue;
    const list = byBlock.get(match.blockNumber) ?? [];
    list.push(match);
    byBlock.set(match.blockNumber, list);
  }

  const conflicts: string[] = [];
  for (const [block, blockMatches] of byBlock) {
    const seen = new Set<string>();
    for (const match of blockMatches) {
      for (const teamId of [match.teamAId, match.teamBId]) {
        if (seen.has(teamId)) conflicts.push(`Bloco ${block}: dupla ${teamId} repetida`);
        seen.add(teamId);
      }
    }
  }
  return conflicts;
}

/**
 * Valida a garantia que realmente importa para o jogador: na fila única e sequencial
 * (ordenada por queue_position, a mesma ordem que "Ordem dos Jogos" exibe), nenhuma dupla
 * pode aparecer em duas posições consecutivas — isso seria o equivalente a "jogando dois
 * jogos ao mesmo tempo" na visão de fila. Mesa é só um detalhe interno; esta checagem é
 * sobre a ordem final que o jogador vê, não sobre blocos internos do escalonador.
 */
export function findQueueAdjacencyConflicts(matches: Match[]): string[] {
  const ordered = matches
    .filter((m) => m.queuePosition !== null)
    .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));

  const conflicts: string[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    const prevTeams = new Set([prev.teamAId, prev.teamBId]);
    for (const teamId of [curr.teamAId, curr.teamBId]) {
      if (prevTeams.has(teamId)) {
        conflicts.push(`Jogo ${i} e Jogo ${i + 1}: dupla ${teamId} joga em sequência sem descanso`);
      }
    }
  }
  return conflicts;
}
