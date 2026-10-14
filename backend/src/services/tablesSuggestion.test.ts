import test from "node:test";
import assert from "node:assert/strict";
import { suggestNextMatches, type TableCandidate } from "@truco/shared";
import { generateGroupMatches } from "./groupMatchesService.js";
import { buildSchedule } from "./scheduleBuilder.js";
import type { Match } from "@truco/shared";

const TEAMS = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"];

interface Run {
  /** Minuto em que o último jogo terminou. */
  makespan: number;
  /** Instantes em que havia mesa livre E confronto compatível disponível, mas a mesa ficou vazia. */
  idleWithCompatible: number;
  /** Minutos de mesa vazia enquanto ainda havia jogo por fazer (inclui os inevitáveis). */
  idleMinutes: number;
  played: Array<{ id: string; teamAId: string; teamBId: string; start: number; end: number; table: number }>;
}

/**
 * Simula a fase de grupos por eventos: cada mesa que fica livre recebe o próximo confronto
 * escolhido por `pick`; cada jogo dura entre 15 e 45 minutos (sorteado pela semente).
 */
function simulate(seed: number, pick: (pending: TableCandidate[], busy: Set<string>, free: number, last: Map<string, number>) => TableCandidate[]): Run {
  let state = seed >>> 0;
  const random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pending: TableCandidate[] = generateGroupMatches(TEAMS).map((pair, index) => ({ id: "m" + index, ...pair }));
  const tables: Array<{ match: TableCandidate; end: number; start: number } | null> = [null, null, null];
  const last = new Map<string, number>();
  const run: Run = { makespan: 0, idleWithCompatible: 0, idleMinutes: 0, played: [] };
  let now = 0;
  for (;;) {
    // Mesas livres recebem jogo.
    const busy = new Set(tables.flatMap((slot) => (slot ? [slot.match.teamAId, slot.match.teamBId] : [])));
    const free = tables.filter((slot) => slot === null).length;
    const picks = pick(pending, busy, free, last);
    for (const match of picks) {
      const table = tables.findIndex((slot) => slot === null);
      tables[table] = { match, start: now, end: now + 15 + Math.floor(random() * 31) };
      pending.splice(pending.indexOf(match), 1);
    }
    // Conferência: sobrou mesa livre com confronto possível?
    const busyAfter = new Set(tables.flatMap((slot) => (slot ? [slot.match.teamAId, slot.match.teamBId] : [])));
    const stillFree = tables.filter((slot) => slot === null).length;
    if (stillFree > 0 && pending.some((match) => !busyAfter.has(match.teamAId) && !busyAfter.has(match.teamBId))) run.idleWithCompatible += 1;
    const active = tables.filter((slot) => slot !== null);
    if (active.length === 0) break;
    // Avança até o próximo jogo terminar (às vezes dois ou três terminam juntos).
    const next = Math.min(...active.map((slot) => slot!.end));
    if (pending.length > 0) run.idleMinutes += stillFree * (next - now);
    now = next;
    tables.forEach((slot, index) => {
      if (slot && slot.end === now) {
        run.played.push({ ...slot.match, start: slot.start, end: slot.end, table: index + 1 });
        last.set(slot.match.teamAId, now);
        last.set(slot.match.teamBId, now);
        tables[index] = null;
      }
    });
  }
  run.makespan = now;
  return run;
}

const engine = (pending: TableCandidate[], busy: Set<string>, free: number, last: Map<string, number>) =>
  suggestNextMatches({ pending, busyTeamIds: busy, freeTables: free, lastFinishedAt: last });

/** A fila fixa de hoje ("Ordem dos Jogos"): a mesa livre pega o primeiro da fila cujas duplas estão livres. */
function queueOf(): string[] {
  const matches = generateGroupMatches(TEAMS).map((pair, index): Match => ({
    ...pair, id: "m" + index, championshipId: "x", stage: "grupos", round: "Grupo A", groupId: "A", result: null, status: "pendente", tableNumber: null, blockNumber: null, queuePosition: null,
  }));
  return buildSchedule(matches).sort((a, b) => a.queuePosition - b.queuePosition).map((item) => item.matchId);
}
const fixedQueue = queueOf();
const queue = (pending: TableCandidate[], busy: Set<string>, free: number) => {
  const chosen: TableCandidate[] = [];
  const used = new Set(busy);
  for (const id of fixedQueue) {
    if (chosen.length >= free) break;
    const match = pending.find((item) => item.id === id);
    if (!match || used.has(match.teamAId) || used.has(match.teamBId)) continue;
    chosen.push(match);
    used.add(match.teamAId);
    used.add(match.teamBId);
  }
  return chosen;
};

test("sugestão: nunca põe a mesma dupla em duas mesas e respeita o número de mesas livres", () => {
  const pending = generateGroupMatches(TEAMS).map((pair, index) => ({ id: "m" + index, ...pair }));
  const three = suggestNextMatches({ pending, busyTeamIds: [], freeTables: 3 });
  assert.equal(three.length, 3);
  assert.equal(new Set(three.flatMap((match) => [match.teamAId, match.teamBId])).size, 6);
  // Com a1, a2, a3 e a4 jogando, só a5, a6 e a7 estão livres: cabe um jogo só.
  const one = suggestNextMatches({ pending, busyTeamIds: ["a1", "a2", "a3", "a4"], freeTables: 2 });
  assert.equal(one.length, 1);
  assert.ok(one.every((match) => !["a1", "a2", "a3", "a4"].includes(match.teamAId) && !["a1", "a2", "a3", "a4"].includes(match.teamBId)));
  assert.deepEqual(suggestNextMatches({ pending: [], busyTeamIds: [], freeTables: 3 }), []);
});

test("2.000 fases de grupos com jogos de 15 a 45 min: 21 jogos, cada par uma vez, nenhuma dupla em duas mesas e nenhuma mesa vazia com jogo possível", () => {
  const stats = { makespan: [] as number[], idle: [] as number[], queueMakespan: [] as number[], queueIdleWithCompatible: 0 };
  for (let seed = 1; seed <= 2000; seed += 1) {
    const run = simulate(seed, engine);
    assert.equal(run.played.length, 21, "seed " + seed);
    assert.equal(new Set(run.played.map((match) => [match.teamAId, match.teamBId].sort().join("x"))).size, 21);
    for (const team of TEAMS) assert.equal(run.played.filter((match) => match.teamAId === team || match.teamBId === team).length, 6);
    // Nenhuma dupla em dois jogos que se sobrepõem no tempo.
    for (const a of run.played) for (const b of run.played) {
      if (a === b || a.end <= b.start || b.end <= a.start) continue;
      assert.equal([a.teamAId, a.teamBId].some((team) => team === b.teamAId || team === b.teamBId), false, `seed ${seed}: dupla em duas mesas`);
    }
    assert.equal(run.idleWithCompatible, 0, `seed ${seed}: mesa vazia com confronto possível`);
    stats.makespan.push(run.makespan);
    stats.idle.push(run.idleMinutes);
    const fixed = simulate(seed, queue);
    stats.queueMakespan.push(fixed.makespan);
    stats.queueIdleWithCompatible += fixed.idleWithCompatible;
  }
  const average = (list: number[]) => Math.round(list.reduce((sum, value) => sum + value, 0) / list.length);
  const report = {
    motor: { duracaoMediaMin: average(stats.makespan), piorCasoMin: Math.max(...stats.makespan), mesaVaziaMediaMin: average(stats.idle) },
    filaFixa: { duracaoMediaMin: average(stats.queueMakespan), piorCasoMin: Math.max(...stats.queueMakespan) },
  };
  console.log("[mesas] " + JSON.stringify(report));
  // A fila fixa tem a mesma regra de "pular quem está jogando": o motor não pode ser pior que ela.
  assert.ok(report.motor.duracaoMediaMin <= report.filaFixa.duracaoMediaMin);
});

test("rodadas visuais: 7 rodadas de 3 mesas, uma dupla descansando, cada par uma vez e cada dupla descansa uma vez", async () => {
  const { buildGroupRounds, pairKey } = await import("@truco/shared");
  const rounds = buildGroupRounds(TEAMS);
  assert.equal(rounds.length, 7);
  const pairs = new Set<string>();
  const resting: string[] = [];
  for (const round of rounds) {
    assert.deepEqual(round.tables.map((table) => table.table), [1, 2, 3]);
    const playing = round.tables.flatMap((table) => [table.teamAId, table.teamBId]);
    assert.equal(new Set(playing).size, 6, "rodada " + round.round + " repete dupla");
    assert.ok(round.restingTeamId && !playing.includes(round.restingTeamId));
    resting.push(round.restingTeamId!);
    for (const table of round.tables) pairs.add(pairKey(table.teamAId, table.teamBId));
  }
  assert.equal(pairs.size, 21);
  assert.deepEqual([...resting].sort(), [...TEAMS].sort(), "cada dupla descansa exatamente uma rodada");
  // A mesma ordem de entrada dá sempre as mesmas rodadas.
  assert.deepEqual(buildGroupRounds(TEAMS), rounds);
  // Todos os pares das rodadas existem entre os 21 jogos gerados pelo sistema.
  const generated = new Set(generateGroupMatches(TEAMS).map((pair) => pairKey(pair.teamAId, pair.teamBId)));
  assert.deepEqual([...pairs].sort(), [...generated].sort());
});

test("rodadas visuais: a mesa de cada dupla varia entre as rodadas", async () => {
  const { buildGroupRounds } = await import("@truco/shared");
  const tablesOf = (team: string) => new Set(buildGroupRounds(TEAMS).flatMap((round) => round.tables.filter((table) => table.teamAId === team || table.teamBId === team).map((table) => table.table)));
  for (const team of TEAMS) assert.ok(tablesOf(team).size >= 2, team + " ficou presa a uma mesa");
});
