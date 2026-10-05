import test from "node:test";
import assert from "node:assert/strict";
import { isValidTeamStrength, pointsForResult, qualificationForPosition, type Match, type Player, type Team } from "@truco/shared";
import { store } from "../data/simulationStore.js";
import { computeStandings } from "./simulation/standingsService.js";
import { recordResult } from "./simulation/matchService.js";
import { canRecordEditionResult, canRecordMatchResult } from "./matchAuthorization.js";
import { validateTeamParticipation, validateTeamStatusChange } from "./teamParticipationService.js";
import { generateGroupMatches } from "./groupMatchesService.js";

test("a pontuação 2x0 e 2x1 é simétrica para a dupla vencedora e perdedora", () => {
  assert.deepEqual([pointsForResult({ setsA: 2, setsB: 0 }, true), pointsForResult({ setsA: 2, setsB: 0 }, false)], [3, 0]);
  assert.deepEqual([pointsForResult({ setsA: 2, setsB: 1 }, true), pointsForResult({ setsA: 2, setsB: 1 }, false)], [2, 1]);
  assert.deepEqual([pointsForResult({ setsA: 1, setsB: 2 }, true), pointsForResult({ setsA: 1, setsB: 2 }, false)], [1, 2]);
});

test("cinco posições têm zonas corretas: semifinal, repescagem e eliminado", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(qualificationForPosition), ["semifinal", "repescagem", "repescagem", "repescagem", "eliminado"]);
  assert.throws(() => qualificationForPosition(6), RangeError);
});

test("cinco duplas por grupo geram exatamente dez jogos e rejeitam formato diferente", () => {
  const matches = generateGroupMatches(["a1", "a2", "a3", "a4", "a5"]);
  assert.equal(matches.length, 10);
  assert.equal(new Set(matches.map((match) => [match.teamAId, match.teamBId].sort().join(":"))).size, 10);
  assert.throws(() => generateGroupMatches(["a1", "a2", "a3", "a4", "a5", "a6"]), RangeError);
});

test("a edição aceita no máximo cinco duplas em cada grupo", () => {
  const players: Player[] = Array.from({ length: 12 }, (_, index) => ({ id: `p${index + 1}`, name: `P${index + 1}`, role: "jogador", teamId: null, avatarUrl: null }));
  const teams: Team[] = Array.from({ length: 5 }, (_, index) => ({ id: `a${index}`, name: `A${index}`, player1Id: `p${index * 2 + 1}`, player2Id: `p${index * 2 + 2}`, status: "aprovada", seeded: false, isPlaceholder: false, groupId: "A", strength: 3 }));
  const input = { name: "Sexta", player1Id: "p11", player2Id: "p12", groupId: "A" as const, strength: 3 };
  assert.match(validateTeamParticipation(input, teams, players) ?? "", /já tem 5/);
  assert.equal(validateTeamParticipation({ ...input, groupId: "B" }, teams, players), null);
});

test("retirada e reativação de participação respeitam os limites de cinco por grupo", () => {
  const teams: Team[] = Array.from({ length: 6 }, (_, index) => ({ id: `t${index}`, name: `A${index}`, player1Id: `p${index * 2}`, player2Id: `p${index * 2 + 1}`, status: index < 5 ? "aprovada" : "pendente", seeded: false, isPlaceholder: false, groupId: "A", strength: 3 }));
  assert.match(validateTeamStatusChange(teams, "t5", "aprovada") ?? "", /5 duplas/);
  teams[0].status = "pendente";
  assert.equal(validateTeamStatusChange(teams, "t5", "aprovada"), null);
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

test("classificação com 5 duplas aceita exatamente 4 jogos por dupla", () => {
  store.reset();
  const teams = store.teams.slice(0, 5);
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
  assert.equal(rows.length, 5);
  assert.ok(rows.every((row) => row.jogos === 4));
  assert.deepEqual(rows.map((row) => row.position), [1, 2, 3, 4, 5]);
});
