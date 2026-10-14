import test from "node:test";
import assert from "node:assert/strict";
import { EDITION_TEAM_COUNT, MATCHES_PER_GROUP, TEAMS_PER_GROUP, isValidTeamStrength, pointsForResult, qualificationForPosition, type Match, type Player, type Team } from "@truco/shared";
import { store } from "../data/simulationStore.js";
import { computeStandings } from "./simulation/standingsService.js";
import { recordResult } from "./simulation/matchService.js";
import { canRecordEditionResult, canRecordMatchResult } from "./matchAuthorization.js";
import { validateTeamParticipation, validateTeamStatusChange } from "./teamParticipationService.js";
import { generateGroupMatches, missingGroupMatches, planGroupCompletion } from "./groupMatchesService.js";
import { buildSchedule, findConflicts, findQueueAdjacencyConflicts } from "./scheduleBuilder.js";

test("a pontuação 2x0 e 2x1 é simétrica para a dupla vencedora e perdedora", () => {
  assert.deepEqual([pointsForResult({ setsA: 2, setsB: 0 }, true), pointsForResult({ setsA: 2, setsB: 0 }, false)], [3, 0]);
  assert.deepEqual([pointsForResult({ setsA: 2, setsB: 1 }, true), pointsForResult({ setsA: 2, setsB: 1 }, false)], [2, 1]);
  assert.deepEqual([pointsForResult({ setsA: 1, setsB: 2 }, true), pointsForResult({ setsA: 1, setsB: 2 }, false)], [1, 2]);
});

test("formato definitivo da edição: grupo único de 7 duplas e 21 jogos", () => {
  assert.deepEqual([TEAMS_PER_GROUP, EDITION_TEAM_COUNT, MATCHES_PER_GROUP], [7, 7, 21]);
});

test("sete posições têm zonas corretas: 1º e 2º semifinal, 3º a 6º quartas, 7º eliminado", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((position) => qualificationForPosition(position)), ["semifinal", "semifinal", "quartas", "quartas", "quartas", "quartas", "eliminado"]);
  assert.throws(() => qualificationForPosition(8), RangeError);
  assert.throws(() => qualificationForPosition(0), RangeError);
});

test("sete duplas geram 21 jogos em 7 rodadas de 3, cada dupla folga uma vez, e rejeitam formato diferente", () => {
  const ids = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"];
  const matches = generateGroupMatches(ids);
  assert.equal(matches.length, 21);
  assert.equal(new Set(matches.map((match) => [match.teamAId, match.teamBId].sort().join(":"))).size, 21);
  assert.deepEqual(matches.map((match) => match.order), Array.from({ length: 21 }, (_, index) => index));
  for (let round = 0; round < 7; round += 1) {
    const teams = matches.slice(round * 3, round * 3 + 3).flatMap((match) => [match.teamAId, match.teamBId]);
    assert.equal(new Set(teams).size, 6, "rodada " + (round + 1) + " repete dupla");
  }
  ids.forEach((id) => assert.equal(matches.filter((match) => match.teamAId === id || match.teamBId === id).length, 6));
  assert.throws(() => generateGroupMatches(ids.slice(0, 6)), RangeError);
  assert.throws(() => generateGroupMatches([...ids, "a8"]), RangeError);
});

test("a edição aceita no máximo sete duplas aprovadas, todas no grupo único", () => {
  const players: Player[] = Array.from({ length: 30 }, (_, index) => ({ id: "p" + (index + 1), name: "P" + (index + 1), role: "jogador", teamId: null, avatarUrl: null }));
  const team = (id: string, index: number): Team => ({ id, name: id, player1Id: "p" + (index * 2 + 1), player2Id: "p" + (index * 2 + 2), status: "aprovada", seeded: false, isPlaceholder: false, groupId: "A", strength: 3 });
  const six = Array.from({ length: 6 }, (_, index) => team("a" + index, index));
  const seventh = { name: "Sétima", player1Id: "p25", player2Id: "p26", groupId: "A" as const, strength: 3 };
  assert.equal(validateTeamParticipation(seventh, six, players), null);

  const seven = [...six, team("a6", 6)];
  assert.match(validateTeamParticipation({ ...seventh, name: "Oitava" }, seven, players) ?? "", /7 duplas/);
  assert.match(validateTeamParticipation({ ...seventh, groupId: "B" as never }, six, players) ?? "", /grupo único/);
});

test("retirada e reativação de participação respeitam o limite de sete duplas", () => {
  const teams: Team[] = Array.from({ length: 8 }, (_, index) => ({ id: "t" + index, name: "A" + index, player1Id: "p" + (index * 2), player2Id: "p" + (index * 2 + 1), status: index < 7 ? "aprovada" : "pendente", seeded: false, isPlaceholder: false, groupId: "A", strength: 3 }));
  assert.match(validateTeamStatusChange(teams, "t7", "aprovada") ?? "", /7 duplas/);
  teams[0].status = "pendente";
  assert.equal(validateTeamStatusChange(teams, "t7", "aprovada"), null);
});

// Grupo único com 21 jogos, 4 já disputados pela dupla a1. A dupla a7 é a que entra depois.
function editionSnapshot(): Match[] {
  const ids = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"];
  const results = new Map<string, [number, number]>([["a1:a2", [2, 1]], ["a1:a3", [2, 1]], ["a1:a4", [1, 2]], ["a1:a5", [2, 0]]]);
  return generateGroupMatches(ids).map((pair, index) => {
    const result = results.get([pair.teamAId, pair.teamBId].sort().join(":")) ?? null;
    return {
      ...pair, id: "A-" + pair.order, championshipId: "edicao-5", stage: "grupos", round: "Grupo A", groupId: "A",
      result: result ? { setsA: result[0], setsB: result[1] } : null, status: result ? "realizado" : "pendente", tableNumber: null, blockNumber: null, queuePosition: index + 1,
    } satisfies Match;
  });
}

// Mesmo retrato sem a dupla 7: o cenário de uma dupla que entra depois dos jogos gerados.
const withoutSeventh = (matches: Match[]) => matches.filter((match) => match.teamAId !== "a7" && match.teamBId !== "a7");

test("a dupla que entra depois recebe só os jogos que faltam, sem tocar nos existentes", () => {
  const existing = withoutSeventh(editionSnapshot());
  const before = JSON.stringify(existing);
  const ids = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"];
  const missing = missingGroupMatches(ids, existing);
  assert.equal(missing.length, 6);
  assert.ok(missing.every((pair) => pair.teamAId === "a7" || pair.teamBId === "a7"));
  assert.equal(JSON.stringify(existing), before);

  const complete = [...existing, ...missing.map((pair) => ({ ...pair }))];
  assert.equal(complete.length, MATCHES_PER_GROUP);
  assert.deepEqual(missingGroupMatches(ids, complete), []);
  // Jogo de dupla que saiu do grupo é sinal de grupo divergente: não completa às cegas.
  assert.throws(() => missingGroupMatches(["a1", "a2", "a3", "a4", "a5", "a8", "a9"], existing), RangeError);
});

test("completar o grupo intercala os pendentes, preserva os realizados e não põe dupla em jogos seguidos", () => {
  const existing = withoutSeventh(editionSnapshot());
  const ids = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"];
  const plan = planGroupCompletion(ids, existing);
  assert.equal(plan.created.length, 6);
  const played = existing.filter((match) => match.status === "realizado");
  assert.ok(plan.reordered.every((item) => !played.some((match) => match.id === item.matchId)));

  const orders = new Map(plan.reordered.map((item) => [item.matchId, item.order]));
  const all: Match[] = [
    ...existing.map((match) => ({ ...match, order: orders.get(match.id) ?? match.order })),
    ...plan.created.map((pair): Match => ({
      ...pair, id: "A-novo-" + pair.order, championshipId: "edicao-5", stage: "grupos", round: "Grupo A", groupId: "A",
      result: null, status: "pendente", tableNumber: null, blockNumber: null, queuePosition: null,
    })),
  ];
  assert.equal(new Set(all.map((match) => match.order)).size, MATCHES_PER_GROUP);
  assert.equal(all.length, 21);
  // Os jogos realizados ficam idênticos (placar, status, ordem e posição na fila).
  assert.deepEqual(all.filter((match) => match.status === "realizado"), played);

  const assignments = buildSchedule(all);
  assert.equal(assignments.length, 21 - played.length);
  assert.ok(assignments.every((assignment) => !played.some((match) => match.id === assignment.matchId)));
  const queued = all.map((match) => {
    const assignment = assignments.find((item) => item.matchId === match.id);
    return assignment ? { ...match, queuePosition: assignment.queuePosition, blockNumber: assignment.blockNumber, tableNumber: assignment.tableNumber } : { ...match, queuePosition: null };
  });
  assert.deepEqual(findQueueAdjacencyConflicts(queued), []);
});

test("escala dos 21 jogos gerada do zero: 7 blocos de 3 mesas, sem dupla em duas mesas nem em jogos seguidos", () => {
  const all = generateGroupMatches(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]).map((pair): Match => ({
    ...pair, id: "A-" + pair.order, championshipId: "edicao-5", stage: "grupos", round: "Grupo A", groupId: "A",
    result: null, status: "pendente", tableNumber: null, blockNumber: null, queuePosition: null,
  }));
  const assignments = buildSchedule(all);
  assert.equal(assignments.length, 21);
  assert.ok(Math.max(...assignments.map((item) => item.blockNumber)) <= 7, "mais blocos que o necessário");
  const queued = all.map((match) => {
    const assignment = assignments.find((item) => item.matchId === match.id)!;
    return { ...match, queuePosition: assignment.queuePosition, blockNumber: assignment.blockNumber, tableNumber: assignment.tableNumber };
  });
  assert.deepEqual(findConflicts(queued), []);
  assert.deepEqual(findQueueAdjacencyConflicts(queued), []);
});

test("força de dupla aceita somente inteiros entre uma e cinco estrelas", () => {
  [1, 2, 3, 4, 5].forEach((strength) => assert.equal(isValidTeamStrength(strength), true));
  [0, 6, 2.5, -1].forEach((strength) => assert.equal(isValidTeamStrength(strength), false));
});

test("uma pessoa não pode pertencer a duas duplas na mesma edição", () => {
  const players: Player[] = ["p1", "p2", "p3"].map((id) => ({ id, name: id, role: "jogador", teamId: null, avatarUrl: null }));
  const teams: Team[] = [{ id: "t1", name: "Dupla 1", player1Id: "p1", player2Id: "p2", status: "aprovada", seeded: false, isPlaceholder: false, groupId: "A", strength: 3 }];
  const conflict = validateTeamParticipation({ name: "Dupla 2", player1Id: "p1", player2Id: "p3", groupId: "A", strength: 4 }, teams, players);
  assert.match(conflict ?? "", /uma dupla nesta edição/);
  assert.equal(validateTeamParticipation({ name: "Dupla 1", player1Id: "p1", player2Id: "p2", groupId: "A", strength: 3 }, teams, players, "t1"), null);
});

test("resultado só pode ser lançado por integrante da partida ou admin", () => {
  assert.equal(canRecordMatchResult(null, null, "team-a", "team-b"), false);
  assert.equal(canRecordMatchResult("jogador", "team-c", "team-a", "team-b"), false);
  assert.equal(canRecordMatchResult("jogador", "team-a", "team-a", "team-b"), true);
  assert.equal(canRecordMatchResult("jogador", "team-b", "team-a", "team-b"), true);
  assert.equal(canRecordMatchResult("admin", null, "team-a", "team-b"), true);
});

test("a autorização de resultado exige vínculo com partida e edição atual", () => {
  assert.equal(canRecordEditionResult("jogador", "p1", ["p1", "p2", "p3", "p4"], true), true);
  assert.equal(canRecordEditionResult("jogador", "p5", ["p1", "p2", "p3", "p4"], true), false);
  assert.equal(canRecordEditionResult("admin", null, [], false), false);
  assert.equal(canRecordEditionResult("admin", null, [], true), true);
});

test("corrigir um resultado recalcula os pontos em vez de acumular o lançamento anterior", () => {
  store.reset();
  const teamA = store.teams[0];
  const teamB = store.teams[1];
  store.groups[0].teamIds = [teamA.id, teamB.id];
  const match: Match = {
    id: "correction-test", championshipId: "simulation", stage: "grupos", round: "Grupo A", order: 0, groupId: "A",
    teamAId: teamA.id, teamBId: teamB.id, result: null, status: "pendente",
    tableNumber: null, blockNumber: null, queuePosition: null,
  };
  store.matches = [match];
  recordResult(match.id, { setsA: 2, setsB: 0 });
  assert.deepEqual(computeStandings("A").map((row) => row.pontos), [3, 0]);
  recordResult(match.id, { setsA: 2, setsB: 1 });
  assert.deepEqual(computeStandings("A").map((row) => row.pontos), [2, 1]);
  assert.equal(computeStandings("A").every((row) => row.jogos === 1), true);
});

test("classificação com 7 duplas aceita exatamente 6 jogos por dupla", () => {
  store.reset();
  const teams = store.teams.slice(0, 7);
  store.groups[0].teamIds = teams.map((team) => team.id);
  store.matches = generateGroupMatches(teams.map((team) => team.id)).map((fixture, index) => ({
    ...fixture,
    id: `five-team-${index}`,
    championshipId: "simulation",
    stage: "grupos",
    round: "Grupo A",
    groupId: "A",
    result: { setsA: index % 2 === 0 ? 2 : 0, setsB: index % 2 === 0 ? 0 : 2 },
    status: "realizado",
    tableNumber: null,
    blockNumber: null,
    queuePosition: null,
  }));
  const rows = computeStandings("A");
  assert.equal(rows.length, 7);
  assert.ok(rows.every((row) => row.jogos === 6));
  assert.deepEqual(rows.map((row) => row.position), [1, 2, 3, 4, 5, 6, 7]);
});
