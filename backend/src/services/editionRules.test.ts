import test from "node:test";
import assert from "node:assert/strict";
import { EDITION_TEAM_COUNT, MATCHES_PER_GROUP, TEAMS_PER_GROUP, isValidTeamStrength, pointsForResult, qualificationForPosition, type Match, type Player, type Team } from "@truco/shared";
import { store } from "../data/simulationStore.js";
import { computeStandings } from "./simulation/standingsService.js";
import { recordResult } from "./simulation/matchService.js";
import { canRecordEditionResult, canRecordMatchResult } from "./matchAuthorization.js";
import { validateTeamParticipation, validateTeamStatusChange } from "./teamParticipationService.js";
import { generateGroupMatches, missingGroupMatches, planGroupCompletion } from "./groupMatchesService.js";
import { buildSchedule, findQueueAdjacencyConflicts } from "./scheduleBuilder.js";

test("a pontuação 2x0 e 2x1 é simétrica para a dupla vencedora e perdedora", () => {
  assert.deepEqual([pointsForResult({ setsA: 2, setsB: 0 }, true), pointsForResult({ setsA: 2, setsB: 0 }, false)], [3, 0]);
  assert.deepEqual([pointsForResult({ setsA: 2, setsB: 1 }, true), pointsForResult({ setsA: 2, setsB: 1 }, false)], [2, 1]);
  assert.deepEqual([pointsForResult({ setsA: 1, setsB: 2 }, true), pointsForResult({ setsA: 1, setsB: 2 }, false)], [1, 2]);
});

test("formato definitivo da edição: 2 grupos de 6 duplas, 12 no total e 15 jogos por grupo", () => {
  assert.deepEqual([TEAMS_PER_GROUP, EDITION_TEAM_COUNT, MATCHES_PER_GROUP], [6, 12, 15]);
});

test("seis posições têm zonas corretas: 1º semifinal, 2º a 5º repescagem, 6º eliminado", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((position) => qualificationForPosition(position)), ["semifinal", "repescagem", "repescagem", "repescagem", "repescagem", "eliminado"]);
  assert.throws(() => qualificationForPosition(7), RangeError);
  assert.throws(() => qualificationForPosition(0), RangeError);
});

test("seis duplas por grupo geram exatamente quinze jogos e rejeitam formato diferente", () => {
  const matches = generateGroupMatches(["a1", "a2", "a3", "a4", "a5", "a6"]);
  assert.equal(matches.length, 15);
  assert.equal(new Set(matches.map((match) => [match.teamAId, match.teamBId].sort().join(":"))).size, 15);
  assert.throws(() => generateGroupMatches(["a1", "a2", "a3", "a4", "a5"]), RangeError);
});

test("a edição aceita no máximo seis duplas em cada grupo e doze no total", () => {
  const players: Player[] = Array.from({ length: 30 }, (_, index) => ({ id: `p${index + 1}`, name: `P${index + 1}`, role: "jogador", teamId: null, avatarUrl: null }));
  const team = (id: string, index: number, groupId: "A" | "B"): Team => ({ id, name: id, player1Id: `p${index * 2 + 1}`, player2Id: `p${index * 2 + 2}`, status: "aprovada", seeded: false, isPlaceholder: false, groupId, strength: 3 });
  const fiveA = Array.from({ length: 5 }, (_, index) => team(`a${index}`, index, "A"));
  const sixth = { name: "Sexta", player1Id: "p25", player2Id: "p26", groupId: "A" as const, strength: 3 };
  assert.equal(validateTeamParticipation(sixth, fiveA, players), null);

  const sixA = [...fiveA, team("a5", 5, "A")];
  assert.match(validateTeamParticipation({ ...sixth, name: "Sétima" }, sixA, players) ?? "", /já tem 6/);
  assert.equal(validateTeamParticipation({ ...sixth, groupId: "B" }, sixA, players), null);

  const twelve = [...sixA, ...Array.from({ length: 6 }, (_, index) => team(`b${index}`, 6 + index, "B"))];
  assert.match(validateTeamParticipation({ ...sixth, player1Id: "p27", player2Id: "p28", groupId: "B" }, twelve, players) ?? "", /12 duplas/);
});

test("dupla aprovada não pode mudar para um grupo que já está completo", () => {
  const players: Player[] = Array.from({ length: 14 }, (_, index) => ({ id: `p${index + 1}`, name: `P${index + 1}`, role: "jogador", teamId: null, avatarUrl: null }));
  const teams: Team[] = Array.from({ length: 7 }, (_, index) => ({ id: `t${index}`, name: `T${index}`, player1Id: `p${index * 2 + 1}`, player2Id: `p${index * 2 + 2}`, status: "aprovada", seeded: false, isPlaceholder: false, groupId: index < 6 ? "A" : "B", strength: 3 }));
  const moving = { name: "T6", player1Id: "p13", player2Id: "p14", groupId: "A" as const, strength: 3 };
  assert.match(validateTeamParticipation(moving, teams, players, "t6") ?? "", /já tem 6/);
  assert.equal(validateTeamParticipation({ ...moving, groupId: "B" }, teams, players, "t6"), null);
});

test("retirada e reativação de participação respeitam os limites de seis por grupo", () => {
  const teams: Team[] = Array.from({ length: 7 }, (_, index) => ({ id: `t${index}`, name: `A${index}`, player1Id: `p${index * 2}`, player2Id: `p${index * 2 + 1}`, status: index < 6 ? "aprovada" : "pendente", seeded: false, isPlaceholder: false, groupId: "A", strength: 3 }));
  assert.match(validateTeamStatusChange(teams, "t6", "aprovada") ?? "", /6 duplas/);
  teams[0].status = "pendente";
  assert.equal(validateTeamStatusChange(teams, "t6", "aprovada"), null);
});

// Retrato sanitizado da 5ª edição no banco (07/10/2026): 5 duplas por grupo, 20 jogos e os
// 4 resultados reais da dupla a1 (2x1, 2x1, 1x2, 2x0). Ids trocados por códigos neutros.
function editionSnapshot(): Match[] {
  const rows: Array<[groupId: "A" | "B", order: number, teamAId: string, teamBId: string, result: [number, number] | null, queuePosition: number]> = [
    ["A", 0, "a1", "a5", [2, 1], 1], ["A", 1, "a1", "a4", [2, 1], 4], ["A", 2, "a1", "a3", [1, 2], 10], ["A", 3, "a1", "a2", [2, 0], 9],
    ["A", 4, "a5", "a4", null, 13], ["A", 5, "a5", "a3", null, 7], ["A", 6, "a5", "a2", null, 16], ["A", 7, "a4", "a3", null, 3], ["A", 8, "a4", "a2", null, 19], ["A", 9, "a3", "a2", null, 15],
    ["B", 0, "b5", "b1", null, 2], ["B", 1, "b5", "b2", null, 8], ["B", 2, "b5", "b3", null, 14], ["B", 3, "b5", "b4", null, 6], ["B", 4, "b1", "b2", null, 17],
    ["B", 5, "b1", "b3", null, 11], ["B", 6, "b1", "b4", null, 20], ["B", 7, "b2", "b3", null, 5], ["B", 8, "b2", "b4", null, 12], ["B", 9, "b3", "b4", null, 18],
  ];
  return rows.map(([groupId, order, teamAId, teamBId, result, queuePosition]) => ({
    id: `${groupId}-${order}`, championshipId: "edicao-5", stage: "grupos", round: `Grupo ${groupId}`, order, groupId, teamAId, teamBId,
    result: result ? { setsA: result[0], setsB: result[1] } : null, status: result ? "realizado" : "pendente", tableNumber: null, blockNumber: null, queuePosition,
  }));
}

test("a 6ª dupla de cada grupo recebe só os 5 jogos que faltam, sem tocar nos existentes", () => {
  const existing = editionSnapshot();
  const before = JSON.stringify(existing);
  const groupA = ["a1", "a2", "a3", "a4", "a5", "a6"];
  const missingA = missingGroupMatches(groupA, existing.filter((match) => match.groupId === "A"));
  assert.equal(missingA.length, 5);
  assert.ok(missingA.every((pair) => pair.teamAId === "a6" || pair.teamBId === "a6"));
  assert.deepEqual(missingA.map((pair) => pair.order), [10, 11, 12, 13, 14]);
  assert.equal(JSON.stringify(existing), before);

  const complete = [...existing.filter((match) => match.groupId === "A"), ...missingA.map((pair) => ({ ...pair }))];
  assert.equal(complete.length, MATCHES_PER_GROUP);
  assert.deepEqual(missingGroupMatches(groupA, complete), []);
  // Jogo de dupla que saiu do grupo é sinal de grupo divergente: não completa às cegas.
  assert.throws(() => missingGroupMatches(["a1", "a2", "a3", "a4", "a6", "a7"], existing.filter((match) => match.groupId === "A")), RangeError);
});

test("completar 6+6 intercala os pendentes, preserva os realizados e não põe dupla em jogos seguidos", () => {
  const existing = editionSnapshot();
  const all: Match[] = [];
  for (const groupId of ["A", "B"] as const) {
    const ids = [1, 2, 3, 4, 5, 6].map((index) => `${groupId.toLowerCase()}${index}`);
    const groupMatches = existing.filter((match) => match.groupId === groupId);
    const plan = planGroupCompletion(ids, groupMatches);
    assert.equal(plan.created.length, 5);
    const played = new Set(groupMatches.filter((match) => match.status === "realizado").map((match) => match.id));
    assert.ok(plan.reordered.every((item) => !played.has(item.matchId)));

    const orders = new Map(plan.reordered.map((item) => [item.matchId, item.order]));
    all.push(...groupMatches.map((match) => ({ ...match, order: orders.get(match.id) ?? match.order })));
    all.push(...plan.created.map((pair): Match => ({
      ...pair, id: `${groupId}-novo-${pair.order}`, championshipId: "edicao-5", stage: "grupos", round: `Grupo ${groupId}`, groupId,
      result: null, status: "pendente", tableNumber: null, blockNumber: null, queuePosition: null,
    })));
    const groupOrders = all.filter((match) => match.groupId === groupId).map((match) => match.order).sort((a, b) => a - b);
    assert.deepEqual(groupOrders, Array.from({ length: MATCHES_PER_GROUP }, (_, index) => index));
  }
  assert.equal(all.length, 30);
  // Os 4 jogos realizados ficam idênticos (placar, status, ordem e posição na fila).
  const played = existing.filter((match) => match.status === "realizado");
  assert.deepEqual(all.filter((match) => match.status === "realizado"), played);

  const assignments = buildSchedule(all);
  assert.equal(assignments.length, 26);
  assert.ok(assignments.every((assignment) => !played.some((match) => match.id === assignment.matchId)));
  const queued = all.map((match) => {
    const assignment = assignments.find((item) => item.matchId === match.id);
    return assignment ? { ...match, queuePosition: assignment.queuePosition, blockNumber: assignment.blockNumber, tableNumber: assignment.tableNumber } : { ...match, queuePosition: null };
  });
  assert.deepEqual(findQueueAdjacencyConflicts(queued), []);
  for (const teamId of ["a6", "b6"]) {
    const games = queued.filter((match) => match.teamAId === teamId || match.teamBId === teamId).map((match) => match.queuePosition!).sort((a, b) => a - b);
    assert.equal(games.length, 5);
    // A dupla nova entra nos dois primeiros blocos (6 jogos) em vez de jogar tudo no final.
    assert.ok(games[0] <= 6, `${teamId} começa na posição ${games[0]}`);
  }
});

test("escala de 30 jogos gerada do zero para 6+6 não põe dupla em jogos seguidos", () => {
  const all = (["A", "B"] as const).flatMap((groupId) => generateGroupMatches([1, 2, 3, 4, 5, 6].map((index) => `${groupId}${index}`)).map((pair): Match => ({
    ...pair, id: `${groupId}-${pair.order}`, championshipId: "edicao-5", stage: "grupos", round: `Grupo ${groupId}`, groupId,
    result: null, status: "pendente", tableNumber: null, blockNumber: null, queuePosition: null,
  })));
  const assignments = buildSchedule(all);
  assert.equal(assignments.length, 30);
  const queued = all.map((match) => ({ ...match, queuePosition: assignments.find((item) => item.matchId === match.id)!.queuePosition }));
  assert.deepEqual(findQueueAdjacencyConflicts(queued), []);
});

test("força de dupla aceita somente inteiros entre uma e cinco estrelas", () => {
  [1, 2, 3, 4, 5].forEach((strength) => assert.equal(isValidTeamStrength(strength), true));
  [0, 6, 2.5, -1].forEach((strength) => assert.equal(isValidTeamStrength(strength), false));
});

test("uma pessoa não pode pertencer a duas duplas na mesma edição", () => {
  const players: Player[] = ["p1", "p2", "p3"].map((id) => ({ id, name: id, role: "jogador", teamId: null, avatarUrl: null }));
  const teams: Team[] = [{ id: "t1", name: "Dupla 1", player1Id: "p1", player2Id: "p2", status: "aprovada", seeded: false, isPlaceholder: false, groupId: "A", strength: 3 }];
  const conflict = validateTeamParticipation({ name: "Dupla 2", player1Id: "p1", player2Id: "p3", groupId: "B", strength: 4 }, teams, players);
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

test("classificação com 6 duplas aceita exatamente 5 jogos por dupla", () => {
  store.reset();
  const teams = store.teams.slice(0, 6);
  store.groups[0].teamIds = teams.map((team) => team.id);
  store.matches = generateGroupMatches(teams.map((team) => team.id)).map((fixture, index) => ({
    ...fixture,
    id: `six-team-${index}`,
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
  assert.equal(rows.length, 6);
  assert.ok(rows.every((row) => row.jogos === 5));
  assert.deepEqual(rows.map((row) => row.position), [1, 2, 3, 4, 5, 6]);
});
