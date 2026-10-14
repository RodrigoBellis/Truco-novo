import test from "node:test";
import assert from "node:assert/strict";
import {
  EDITION_PRIZES,
  KNOCKOUT_MATCH_COUNT,
  KNOCKOUT_PLAN,
  MATCHES_PER_GROUP,
  STANDINGS_CRITERIA,
  buildKnockoutBracket,
  buildKnockoutView,
  computeGroupStandings,
  describeKnockoutSlot,
  knockoutChampion,
  knockoutThirdPlace,
  pendingTieClusters,
  planKnockoutSync,
  qualificationForPosition,
  type BracketMatch,
  type GroupId,
  type KnockoutKey,
  type Match,
  type MatchResult,
} from "@truco/shared";
import { store } from "../data/simulationStore.js";
import { runFullSimulation } from "./tournamentSimulationService.js";
import { computeStandings } from "./simulation/standingsService.js";
import { planResultChange } from "./resultChangePlan.js";

// Fixtures isoladas: duplas e placares fictícios, só em memória.
type Game = [teamA: string, teamB: string, setsA: number, setsB: number];
const games = (rows: Game[]) => rows.map(([teamAId, teamBId, setsA, setsB]) => ({ teamAId, teamBId, result: { setsA, setsB } }));
const summary = (rows: ReturnType<typeof computeGroupStandings>) => rows.map((row) => row.teamId).join("");

/** Grupo sem empates: a1 vence todos, a2 perde só para a1, e assim por diante. */
const cleanGroup = (prefix: string): { teamIds: string[]; matches: ReturnType<typeof games> } => {
  const teamIds = [1, 2, 3, 4, 5, 6, 7].map((index) => prefix + index);
  const rows: Game[] = [];
  for (let i = 0; i < teamIds.length; i += 1) for (let j = i + 1; j < teamIds.length; j += 1) rows.push([teamIds[i], teamIds[j], 2, 0]);
  return { teamIds, matches: games(rows) };
};

// ---------- Classificação e desempate ----------

test("ordem oficial dos critérios: pontos, vitórias, vitórias por 2x0, confronto direto e saldo de quedas", () => {
  assert.deepEqual([...STANDINGS_CRITERIA], ["pontos", "vitórias", "vitórias por 2x0", "confronto direto", "saldo de quedas"]);
});

test("1º e 2º vão direto para a semifinal, 3º a 6º para as quartas e o 7º é eliminado", () => {
  const { teamIds, matches } = cleanGroup("a");
  const rows = computeGroupStandings(teamIds, matches);
  assert.deepEqual(rows.map((row) => row.teamId), ["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
  assert.deepEqual(
    rows.map((row) => [row.position, qualificationForPosition(row.position, rows.length)]),
    [[1, "semifinal"], [2, "semifinal"], [3, "quartas"], [4, "quartas"], [5, "quartas"], [6, "quartas"], [7, "eliminado"]],
  );
  assert.ok(rows.every((row) => !row.tiePending));
});

test("2º critério — vitórias: mesmos pontos, quem venceu mais fica na frente", () => {
  // m: vitória por 2x0 + derrota por 1x2 = 4 pts, 1 vitória.
  // n: duas vitórias por 2x1 = 4 pts, 2 vitórias.
  // "m" vem antes na lista para provar que a ordem de entrada não interfere.
  const tied = computeGroupStandings(["m", "n", "o"], games([["m", "o", 2, 0], ["n", "o", 2, 1], ["n", "m", 2, 1]]));
  assert.deepEqual(tied.map((row) => [row.teamId, row.pontos, row.vitorias]), [["n", 4, 2], ["m", 4, 1], ["o", 1, 0]]);
  assert.ok(tied.every((row) => !row.tiePending));
});

test("3º critério — vitórias por 2x0: mesmos pontos e vitórias, quem tem mais 2x0 fica na frente", () => {
  // c: 2x0 + 2x0 + derrotas 0x2 e 0x2 = 6 pts, 2 vitórias, duas por 2x0.
  // d: 2x0 + 2x1 + derrota 1x2 + derrota 0x2 = 6 pts, 2 vitórias, uma por 2x0.
  // d venceu c no confronto direto, mas o 2x0 vem antes: c fica na frente.
  const teamIds = ["d", "c", "e", "f", "g"];
  const matches = games([
    ["c", "e", 2, 0], ["c", "f", 2, 0], ["c", "g", 0, 2], ["c", "d", 0, 2],
    ["d", "e", 2, 1], ["d", "f", 1, 2], ["d", "g", 0, 2],
    ["e", "f", 2, 0], ["e", "g", 0, 2], ["f", "g", 0, 2],
  ]);
  const rows = computeGroupStandings(teamIds, matches);
  const c = rows.find((row) => row.teamId === "c")!;
  const d = rows.find((row) => row.teamId === "d")!;
  assert.deepEqual([c.pontos, c.vitorias, c.vitorias2x0], [6, 2, 2]);
  assert.deepEqual([d.pontos, d.vitorias, d.vitorias2x0], [6, 2, 1]);
  assert.ok(c.position < d.position, "c tem mais vitórias por 2x0 e fica à frente de d");
  assert.deepEqual([c.tiePending, d.tiePending], [false, false]);
});

test("4º critério — confronto direto entre duas duplas: quem venceu o jogo entre elas fica na frente", () => {
  // a e b terminam com 4 pontos, 1 vitória e nenhum 2x0. b venceu a (1x2): b fica em 4º, a em 5º.
  // "a" vem antes na lista para provar que não é a ordem de cadastro que decide.
  const teamIds = ["a", "b", "c", "d", "e"];
  const matches = games([
    ["a", "b", 1, 2], ["a", "c", 2, 1], ["a", "d", 1, 2], ["a", "e", 0, 2], ["b", "c", 1, 2],
    ["b", "d", 1, 2], ["b", "e", 0, 2], ["c", "d", 0, 2], ["c", "e", 2, 0], ["d", "e", 0, 2],
  ]);
  const rows = computeGroupStandings(teamIds, matches);
  assert.equal(summary(rows), "edcba");
  const a = rows.find((row) => row.teamId === "a")!;
  const b = rows.find((row) => row.teamId === "b")!;
  assert.deepEqual([a.pontos, a.vitorias, a.vitorias2x0, a.saldoSets], [b.pontos, b.vitorias, b.vitorias2x0, b.saldoSets]);
  assert.deepEqual([b.confrontoDireto, a.confrontoDireto], [1, 0]);
  assert.ok(rows.every((row) => !row.tiePending), "o confronto direto resolve: nada fica pendente");
  // Num grupo de 5 (só para o teste), 4º segue e 5º é o último: o confronto direto decidiu quem sai.
  assert.deepEqual([qualificationForPosition(b.position, 5), qualificationForPosition(a.position, 5)], ["quartas", "eliminado"]);
  // Quem não está empatado com ninguém nos três primeiros critérios não tem confronto direto contado.
  assert.deepEqual(rows.filter((row) => !["a", "b"].includes(row.teamId)).map((row) => row.confrontoDireto), [0, 0, 0]);
});

test("4º critério — três duplas empatadas: vale a mini-tabela só dos jogos entre elas", () => {
  // c, d e e terminam com 6 pontos, 2 vitórias e um 2x0. Entre elas: e venceu c e d; d venceu c.
  const teamIds = ["a", "b", "c", "d", "e"];
  const matches = games([
    ["a", "b", 1, 2], ["a", "c", 1, 2], ["a", "d", 2, 0], ["a", "e", 2, 0], ["b", "c", 0, 2],
    ["b", "d", 0, 2], ["b", "e", 2, 1], ["c", "d", 1, 2], ["c", "e", 0, 2], ["d", "e", 1, 2],
  ]);
  const rows = computeGroupStandings(teamIds, matches);
  assert.equal(summary(rows), "aedcb");
  assert.deepEqual(rows.slice(1, 4).map((row) => [row.teamId, row.confrontoDireto]), [["e", 2], ["d", 1], ["c", 0]]);
  assert.ok(rows.every((row) => !row.tiePending));
});

test("5º critério — saldo de quedas: decide entre duplas iguais nos quatro primeiros", () => {
  // Fase de grupos em andamento: x e y têm 2 pontos, 1 vitória, nenhum 2x0 e ainda não se
  // enfrentaram. x perdeu um jogo por 0x2 (saldo −1); y tem saldo +1 e fica na frente.
  const rows = computeGroupStandings(["x", "y", "p", "q", "r"], games([["x", "p", 2, 1], ["x", "q", 0, 2], ["y", "r", 2, 1]]));
  const x = rows.find((row) => row.teamId === "x")!;
  const y = rows.find((row) => row.teamId === "y")!;
  assert.deepEqual([x.pontos, x.vitorias, x.vitorias2x0, x.confrontoDireto, x.saldoSets], [2, 1, 0, 0, -1]);
  assert.deepEqual([y.pontos, y.vitorias, y.vitorias2x0, y.confrontoDireto, y.saldoSets], [2, 1, 0, 0, 1]);
  assert.ok(y.position < x.position);
});

test("o confronto direto vem antes do saldo de quedas", () => {
  // Fase de grupos em andamento (x com 4 jogos, y com 3): os dois têm 4 pontos, 1 vitória e
  // um 2x0. y tem saldo melhor (−1 contra −3), mas x venceu o jogo entre os dois e fica na frente.
  // "y" vem antes na lista para provar que não é a ordem de cadastro que decide.
  const rows = computeGroupStandings(["y", "x", "p", "q", "r"], games([["x", "y", 2, 0], ["x", "p", 1, 2], ["x", "q", 0, 2], ["x", "r", 0, 2], ["y", "p", 2, 0], ["y", "q", 1, 2]]));
  const x = rows.find((row) => row.teamId === "x")!;
  const y = rows.find((row) => row.teamId === "y")!;
  assert.deepEqual([x.pontos, x.vitorias, x.vitorias2x0, x.confrontoDireto, x.saldoSets], [4, 1, 1, 1, -3]);
  assert.deepEqual([y.pontos, y.vitorias, y.vitorias2x0, y.confrontoDireto, y.saldoSets], [4, 1, 1, 0, -1]);
  assert.ok(x.position < y.position, "x venceu o confronto direto, que vem antes do saldo");
});

test("com o grupo completo, duplas iguais em pontos, vitórias e 2x0 têm sempre o mesmo saldo de quedas", () => {
  // Consequência da pontuação 3/2/1/0 com todos jogando o mesmo número de jogos: nesse ponto
  // o saldo nunca desempata. Quem decide é o confronto direto; se ele também empatar (um
  // "triângulo"), sobra a decisão do administrador. O teste varre 4.000 grupos sorteados.
  const teamIds = ["a", "b", "c", "d", "e"];
  const scores: Array<[number, number]> = [[2, 0], [2, 1], [1, 2], [0, 2]];
  let seed = 20261007;
  const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let tiesSeen = 0;
  for (let round = 0; round < 4000; round += 1) {
    const rows: Game[] = [];
    for (let i = 0; i < 5; i += 1) for (let j = i + 1; j < 5; j += 1) rows.push([teamIds[i], teamIds[j], ...scores[Math.floor(random() * 4)]]);
    const table = computeGroupStandings(teamIds, games(rows));
    for (const row of table) {
      for (const other of table) {
        if (other === row || other.pontos !== row.pontos || other.vitorias !== row.vitorias || other.vitorias2x0 !== row.vitorias2x0) continue;
        tiesSeen += 1;
        assert.equal(other.saldoSets, row.saldoSets);
      }
    }
  }
  assert.ok(tiesSeen > 1000, "a varredura precisa ter encontrado empates de verdade");
});

test("empate que sobrevive aos cinco critérios fica pendente até a decisão do administrador", () => {
  // Triângulo entre a, d e e: 6 pontos, 2 vitórias, um 2x0, uma vitória cada no confronto
  // direto (a venceu d, d venceu e, e venceu a) e saldo zero para os três.
  const teamIds = ["a", "b", "c", "d", "e"];
  const matches = games([
    ["a", "b", 1, 2], ["a", "c", 2, 0], ["a", "d", 2, 1], ["a", "e", 0, 2], ["b", "c", 1, 2],
    ["b", "d", 2, 0], ["b", "e", 2, 1], ["c", "d", 1, 2], ["c", "e", 1, 2], ["d", "e", 2, 0],
  ]);
  const rows = computeGroupStandings(teamIds, matches);
  assert.deepEqual(rows.filter((row) => row.tiePending).map((row) => row.teamId).sort(), ["a", "d", "e"]);
  assert.deepEqual(rows.filter((row) => row.tiePending).map((row) => [row.confrontoDireto, row.saldoSets]), [[1, 0], [1, 0], [1, 0]]);
  assert.deepEqual(rows.filter((row) => !row.tiePending).map((row) => [row.teamId, row.position]), [["b", 1], ["c", 5]]);

  const clusters = pendingTieClusters(rows);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].map((row) => row.position).sort(), [2, 3, 4]);

  // Com o grupo ainda em andamento o empate não é sinalizado: ainda pode se desfazer em quadra.
  assert.ok(computeGroupStandings(teamIds, matches.slice(0, 6)).every((row) => !row.tiePending));

  // Decisão do administrador: e em 2º, a em 3º, d em 4º.
  const decided = computeGroupStandings(teamIds, matches, [{ teamId: "e", position: 2 }, { teamId: "a", position: 3 }, { teamId: "d", position: 4 }]);
  assert.equal(summary(decided), "beadc");
  assert.ok(decided.every((row) => !row.tiePending));
  assert.deepEqual(pendingTieClusters(decided), []);

  // Decisão parcial não resolve: quem ficou sem posição continua pendente.
  const partial = computeGroupStandings(teamIds, matches, [{ teamId: "e", position: 2 }]);
  assert.deepEqual(partial.filter((row) => row.tiePending).map((row) => row.teamId).sort(), ["a", "d", "e"]);
});

// ---------- Chaveamento ----------

const teamAt = (_group: GroupId, position: number) => "a" + position;
const newIds = () => {
  let next = 0;
  return () => "bracket-" + (next += 1);
};

test("plano oficial: quartas 3º×6º e 4º×5º, semifinais com 1º e 2º, final e disputa de 3º lugar", () => {
  assert.deepEqual(KNOCKOUT_PLAN.map((fixture) => [fixture.key, fixture.round, fixture.label]), [
    ["Q1", "quartas", "Quartas 1"], ["Q2", "quartas", "Quartas 2"],
    ["S1", "semifinal", "Semifinal 1"], ["S2", "semifinal", "Semifinal 2"],
    ["T", "terceiro", "Disputa de 3º lugar"], ["F", "final", "Final"],
  ]);
  assert.deepEqual(KNOCKOUT_PLAN.map((fixture) => [describeKnockoutSlot(fixture.slotA), describeKnockoutSlot(fixture.slotB)]), [
    ["3º colocado", "6º colocado"],
    ["4º colocado", "5º colocado"],
    ["1º colocado", "Vencedor das Quartas 2"],
    ["2º colocado", "Vencedor das Quartas 1"],
    ["Perdedor da Semifinal 1", "Perdedor da Semifinal 2"],
    ["Vencedor da Semifinal 1", "Vencedor da Semifinal 2"],
  ]);
  // 21 jogos de grupo + 6 de mata-mata = 27.
  assert.equal(MATCHES_PER_GROUP + KNOCKOUT_MATCH_COUNT, 27);
  assert.deepEqual(EDITION_PRIZES, { campeao: 400, vice: 200, terceiro: 100 });
});

test("buildKnockoutBracket liga cada lado à posição certa ou ao jogo de origem (vencedor ou perdedor)", () => {
  const rows = buildKnockoutBracket(teamAt, newIds());
  const by = (label: string) => rows.find((row) => row.label === label)!;
  assert.deepEqual([by("Quartas 1").slotA, by("Quartas 1").slotB], [{ type: "direct", teamId: "a3" }, { type: "direct", teamId: "a6" }]);
  assert.deepEqual([by("Quartas 2").slotA, by("Quartas 2").slotB], [{ type: "direct", teamId: "a4" }, { type: "direct", teamId: "a5" }]);
  assert.deepEqual([by("Semifinal 1").slotA, by("Semifinal 1").slotB], [{ type: "direct", teamId: "a1" }, { type: "winner", bracketMatchId: by("Quartas 2").id }]);
  assert.deepEqual([by("Semifinal 2").slotA, by("Semifinal 2").slotB], [{ type: "direct", teamId: "a2" }, { type: "winner", bracketMatchId: by("Quartas 1").id }]);
  assert.deepEqual([by("Disputa de 3º lugar").slotA, by("Disputa de 3º lugar").slotB], [{ type: "loser", bracketMatchId: by("Semifinal 1").id }, { type: "loser", bracketMatchId: by("Semifinal 2").id }]);
  assert.deepEqual([by("Final").slotA, by("Final").slotB], [{ type: "winner", bracketMatchId: by("Semifinal 1").id }, { type: "winner", bracketMatchId: by("Semifinal 2").id }]);
  assert.throws(() => buildKnockoutBracket((_group, position) => (position === 6 ? null : "a" + position), newIds()), RangeError);
});

test("o 7º colocado não entra em nenhum confronto do mata-mata", () => {
  const rows = buildKnockoutBracket(teamAt, newIds());
  const direct = rows.flatMap((row) => [row.slotA, row.slotB]).flatMap((slot) => (slot.type === "direct" ? [slot.teamId] : []));
  assert.deepEqual(direct.sort(), ["a1", "a2", "a3", "a4", "a5", "a6"]);
});

/**
 * Executa o mata-mata pelo mesmo plano do campeonato real (planKnockoutSync), em memória.
 * `wins` decide o placar de cada confronto pelo seu código.
 */
function playKnockout(wins: (key: KnockoutKey, teamAId: string, teamBId: string) => MatchResult) {
  const ids = newIds();
  let bracket: BracketMatch[] = [];
  let matches: Match[] = [];
  let phase = "Fase de Grupos";
  let champion: { championTeamId: string; runnerUpTeamId: string; finalResult: string } | null = null;
  const { teamIds, matches: groupGames } = cleanGroup("a");
  const standings = { A: computeGroupStandings(teamIds, groupGames) };
  const snapshot = () => ({ standings, bracket, knockoutMatches: matches, groupOf: () => "A" as const, phase, champion });
  const phases: string[] = [];
  const sync = () => {
    for (let pass = 0; pass < 12; pass += 1) {
      const plan = planKnockoutSync(snapshot(), ids);
      assert.deepEqual(plan.anomalies, []);
      if (plan.steps.length === 0) return;
      for (const step of plan.steps) {
        if (step.type === "create-bracket") bracket = step.rows;
        else if (step.type === "create-match") {
          const match = fixtureMatch("m-" + step.bracketMatchId, "mata-mata", step.teamAId, step.teamBId, null);
          match.round = step.round;
          match.order = step.order;
          matches = [...matches, match];
          bracket = bracket.map((item) => (item.id === step.bracketMatchId ? { ...item, matchId: match.id } : item));
        } else if (step.type === "record-champion") champion = { championTeamId: step.championTeamId, runnerUpTeamId: step.runnerUpTeamId, finalResult: step.finalResult };
        else if (step.type === "set-phase") { phase = step.phase; phases.push(step.phase); }
        else throw new Error("passo inesperado: " + step.type);
      }
    }
    throw new Error("não convergiu");
  };
  const keyOf = (match: Match) => KNOCKOUT_PLAN.find((fixture) => bracket.some((item) => item.matchId === match.id && item.round === fixture.round && item.order === fixture.order))!.key;
  const openKeys = () => matches.filter((match) => !match.result).map(keyOf).sort();
  const play = (key: KnockoutKey) => {
    const match = matches.find((item) => keyOf(item) === key && !item.result)!;
    match.result = wins(key, match.teamAId, match.teamBId);
    match.status = "realizado";
    sync();
  };
  sync();
  return { play, openKeys, view: () => buildKnockoutView({ bracket, matches, teamName: (teamId) => teamId }), phase: () => phase, champion: () => champion, phases, bracket: () => bracket, matches: () => matches };
}

const byKey = (list: ReturnType<typeof buildKnockoutView>, key: KnockoutKey) => list.find((item) => item.key === key)!;
const pair = (list: ReturnType<typeof buildKnockoutView>, key: KnockoutKey) => [byKey(list, key).sideA.teamId, byKey(list, key).sideB.teamId];
const sideAWins: MatchResult = { setsA: 2, setsB: 0 };
const sideBWins: MatchResult = { setsA: 1, setsB: 2 };

test("com o grupo encerrado nascem só as quartas; as semifinais esperam as quartas", () => {
  const run = playKnockout(() => sideAWins);
  assert.equal(run.phase(), "Mata-mata");
  assert.equal(run.bracket().length, 6);
  assert.deepEqual(run.openKeys(), ["Q1", "Q2"]);
  assert.deepEqual(pair(run.view(), "Q1"), ["a3", "a6"]);
  assert.deepEqual(pair(run.view(), "Q2"), ["a4", "a5"]);
  run.play("Q1");
  assert.deepEqual(run.openKeys(), ["Q2", "S2"], "a Semifinal 2 nasce com a Quartas 1");
  assert.deepEqual(pair(run.view(), "S2"), ["a2", "a3"]);
  run.play("Q2");
  assert.deepEqual(pair(run.view(), "S1"), ["a1", "a4"]);
  assert.deepEqual(run.openKeys(), ["S1", "S2"]);
});

test("final e disputa de 3º lugar nascem juntas, só com as duas semifinais encerradas", () => {
  const run = playKnockout((key) => (key === "S2" ? sideBWins : sideAWins));
  run.play("Q1");
  run.play("Q2");
  run.play("S1");
  assert.deepEqual(run.openKeys(), ["S2"], "com uma semifinal só, nem final nem 3º lugar existem");
  run.play("S2");
  assert.deepEqual(run.openKeys(), ["F", "T"]);
  // S1: a1 vence a4. S2: a3 (lado B) vence a2.
  assert.deepEqual(pair(run.view(), "F"), ["a1", "a3"]);
  assert.deepEqual(pair(run.view(), "T"), ["a4", "a2"]);
});

test("o campeão é registrado com a final, mas a edição só encerra com a final E o 3º lugar", () => {
  const run = playKnockout(() => sideAWins);
  for (const key of ["Q1", "Q2", "S1", "S2"] as KnockoutKey[]) run.play(key);
  run.play("F");
  assert.deepEqual(run.champion(), { championTeamId: "a1", runnerUpTeamId: "a2", finalResult: "2x0" });
  assert.equal(run.phase(), "Mata-mata", "sem o 3º lugar a edição continua aberta");
  assert.deepEqual(knockoutChampion(run.view())?.teamId, "a1");
  assert.equal(knockoutThirdPlace(run.view()), null);
  run.play("T");
  assert.equal(run.phase(), "Campeonato Finalizado");
  assert.equal(knockoutThirdPlace(run.view())?.teamId, "a4");
  assert.equal(run.matches().length, 6);
});

test("3º lugar antes da final: a edição só encerra quando a final também tiver placar", () => {
  const run = playKnockout(() => sideBWins);
  for (const key of ["Q1", "Q2", "S1", "S2"] as KnockoutKey[]) run.play(key);
  run.play("T");
  assert.equal(run.phase(), "Mata-mata");
  assert.equal(run.champion(), null);
  run.play("F");
  assert.equal(run.phase(), "Campeonato Finalizado");
  // Q1: a6 vence a3; Q2: a5 vence a4; S1: a5 vence a1; S2: a6 vence a2; F: a6 vence a5; 3º: a2 vence a1.
  assert.deepEqual(run.champion(), { championTeamId: "a6", runnerUpTeamId: "a5", finalResult: "2x1" });
  assert.equal(knockoutThirdPlace(run.view())?.teamId, "a2");
});

test("antes de o mata-mata ser gerado, o chaveamento mostra as posições e a ocupação provisória", () => {
  const view = buildKnockoutView({ bracket: [], matches: [], teamName: (teamId) => teamId, projected: teamAt });
  assert.deepEqual(pair(view, "Q1"), ["a3", "a6"]);
  assert.ok(byKey(view, "Q1").sideA.provisional);
  assert.deepEqual(pair(view, "S1"), ["a1", null]);
  assert.equal(byKey(view, "S1").sideB.placeholder, "Vencedor das Quartas 2");
  assert.equal(byKey(view, "T").sideA.placeholder, "Perdedor da Semifinal 1");
  assert.equal(byKey(view, "F").sideB.placeholder, "Vencedor da Semifinal 2");
  assert.ok(view.every((item) => !item.sameGroup), "grupo único: não existe reencontro a sinalizar");
});

// ---------- Correção de placar ----------

const fixtureMatch = (id: string, stage: Match["stage"], teamAId: string, teamBId: string, result: MatchResult | null): Match => ({
  id, championshipId: "edicao-5", stage, round: stage === "grupos" ? "Grupo A" : "Mata-mata", order: 0, groupId: stage === "grupos" ? "A" : null,
  teamAId, teamBId, result, status: result ? "realizado" : "pendente", tableNumber: null, blockNumber: null, queuePosition: null,
});

function bracketWith(matchIds: Partial<Record<KnockoutKey, string>>): BracketMatch[] {
  const rows = buildKnockoutBracket(teamAt, newIds());
  return rows.map((row) => {
    const key = KNOCKOUT_PLAN.find((fixture) => fixture.round === row.round && fixture.order === row.order)!.key;
    return { ...row, matchId: matchIds[key] ?? null };
  });
}

const free = { blocked: null, repairs: [] };

test("placar de grupo pode ser corrigido até o primeiro placar do mata-mata, e nunca depois", () => {
  const group = fixtureMatch("g1", "grupos", "a1", "a2", { setsA: 2, setsB: 0 });
  const q1 = fixtureMatch("q1", "mata-mata", "a3", "a6", null);
  const bracket = bracketWith({ Q1: "q1" });
  assert.deepEqual(planResultChange(group, { setsA: 0, setsB: 2 }, bracket, [q1]), free);
  const played = { ...q1, result: sideAWins, status: "realizado" as const };
  const blocked = planResultChange(group, { setsA: 0, setsB: 2 }, bracket, [played]);
  assert.match(blocked.blocked ?? "", /Quartas 1/);
});

test("no mata-mata, corrigir o placar sem trocar o vencedor é sempre aceito", () => {
  const q1 = fixtureMatch("q1", "mata-mata", "a3", "a6", { setsA: 2, setsB: 0 });
  const s2 = fixtureMatch("s2", "mata-mata", "a2", "a3", { setsA: 2, setsB: 1 });
  assert.deepEqual(planResultChange(q1, { setsA: 2, setsB: 1 }, bracketWith({ Q1: "q1", S2: "s2" }), [q1, s2]), free);
});

test("trocar o vencedor das quartas ajusta a semifinal enquanto ela não tem placar", () => {
  const q1 = fixtureMatch("q1", "mata-mata", "a3", "a6", { setsA: 2, setsB: 0 });
  const s2 = fixtureMatch("s2", "mata-mata", "a2", "a3", null);
  const bracket = bracketWith({ Q1: "q1", S2: "s2" });
  assert.deepEqual(planResultChange(q1, { setsA: 1, setsB: 2 }, bracket, [q1, s2]), { blocked: null, repairs: [{ matchId: "s2", side: "B", teamId: "a6" }] });
  const blocked = planResultChange(q1, { setsA: 1, setsB: 2 }, bracket, [q1, { ...s2, result: sideAWins }]);
  assert.match(blocked.blocked ?? "", /Semifinal 2/);
  assert.deepEqual(blocked.repairs, []);
});

test("trocar o vencedor de uma semifinal ajusta a final (vencedor) e o 3º lugar (perdedor) ainda sem placar", () => {
  const s1 = fixtureMatch("s1", "mata-mata", "a1", "a4", { setsA: 2, setsB: 0 });
  const final = fixtureMatch("f", "mata-mata", "a1", "a2", null);
  const third = fixtureMatch("t", "mata-mata", "a4", "a3", null);
  const bracket = bracketWith({ S1: "s1", F: "f", T: "t" });
  const plan = planResultChange(s1, { setsA: 0, setsB: 2 }, bracket, [s1, final, third]);
  assert.equal(plan.blocked, null);
  assert.deepEqual([...plan.repairs].sort((a, b) => a.matchId.localeCompare(b.matchId)), [
    { matchId: "f", side: "A", teamId: "a4" },
    { matchId: "t", side: "A", teamId: "a1" },
  ]);
  // Basta um dos dois jogos alimentados ter placar para a troca ser recusada.
  assert.match(planResultChange(s1, { setsA: 0, setsB: 2 }, bracket, [s1, final, { ...third, result: sideAWins }]).blocked ?? "", /3º lugar/);
  assert.match(planResultChange(s1, { setsA: 0, setsB: 2 }, bracket, [s1, { ...final, result: sideAWins }, third]).blocked ?? "", /Final/);
});

test("primeiro lançamento de um jogo do mata-mata e correção da final ou do 3º lugar não dependem de jogo seguinte", () => {
  const q2 = fixtureMatch("q2", "mata-mata", "a4", "a5", null);
  assert.deepEqual(planResultChange(q2, sideAWins, bracketWith({ Q2: "q2" }), [q2]), free);
  const final = fixtureMatch("f", "mata-mata", "a1", "a2", sideAWins);
  const third = fixtureMatch("t", "mata-mata", "a4", "a3", sideAWins);
  assert.deepEqual(planResultChange(final, sideBWins, bracketWith({ F: "f", T: "t" }), [final, third]), free);
  assert.deepEqual(planResultChange(third, sideBWins, bracketWith({ F: "f", T: "t" }), [final, third]), free);
});

test("trocar o vencedor de uma semifinal depois do placar dos jogos seguintes gera recusa, não remonta", () => {
  // Estado vindo do banco com a final já trocada indevidamente: o plano aponta anomalia, não conserta sozinho.
  const run = playKnockout(() => sideAWins);
  for (const key of ["Q1", "Q2", "S1", "S2", "F", "T"] as KnockoutKey[]) run.play(key);
  const matches = run.matches().map((match) => ({ ...match }));
  const final = matches.find((match) => match.round === "Final")!;
  final.teamAId = "a7";
  const { teamIds, matches: groupGames } = cleanGroup("a");
  const plan = planKnockoutSync({ standings: { A: computeGroupStandings(teamIds, groupGames) }, bracket: run.bracket(), knockoutMatches: matches, groupOf: () => "A", phase: run.phase(), champion: run.champion() }, newIds());
  assert.equal(plan.steps.length, 0);
  assert.ok(plan.anomalies.some((message) => /Final/.test(message)));
});

// ---------- Simulação ----------

test("simulação completa segue o chaveamento oficial do início ao campeão e ao 3º lugar em várias seeds", () => {
  for (const seed of [3, 11, 2026, 4242, 90210]) {
    const report = runFullSimulation({ seed });
    assert.equal(report.status, "SIMULAÇÃO APROVADA", "seed " + seed + ": " + report.errors.join(" | "));
    const standings = computeStandings("A");
    const at = (position: number) => store.getTeam(standings.find((row) => row.position === position)!.teamId)!.name;
    const game = (key: KnockoutKey) => byKey(report.knockout, key);
    const winner = (key: KnockoutKey) => (game(key).sideA.winner ? game(key).sideA.name : game(key).sideB.name);
    const loser = (key: KnockoutKey) => (game(key).sideA.winner ? game(key).sideB.name : game(key).sideA.name);

    assert.deepEqual([game("Q1").sideA.name, game("Q1").sideB.name], [at(3), at(6)]);
    assert.deepEqual([game("Q2").sideA.name, game("Q2").sideB.name], [at(4), at(5)]);
    assert.deepEqual([game("S1").sideA.name, game("S1").sideB.name], [at(1), winner("Q2")]);
    assert.deepEqual([game("S2").sideA.name, game("S2").sideB.name], [at(2), winner("Q1")]);
    assert.deepEqual([game("T").sideA.name, game("T").sideB.name], [loser("S1"), loser("S2")]);
    assert.deepEqual([game("F").sideA.name, game("F").sideB.name], [winner("S1"), winner("S2")]);
    assert.equal(report.final.championTeamName, winner("F"));
    assert.equal(report.final.runnerUpTeamName, loser("F"));
    assert.equal(report.final.thirdPlaceTeamName, winner("T"));
    assert.deepEqual([report.groupMatches, report.knockoutMatches, report.totalMatches], [21, 6, 27]);

    assert.equal(report.groups.length, 1);
    const [group] = report.groups;
    assert.deepEqual(group.standings.map((row) => row.zone), ["semifinal", "semifinal", "quartas", "quartas", "quartas", "quartas", "eliminado"]);
    assert.equal(group.qualifiedQuarter.length, 4);
    // O eliminado não aparece em nenhum confronto.
    assert.ok(report.knockout.every((item) => item.sideA.name !== group.eliminated && item.sideB.name !== group.eliminated));
  }
});

test("simulação em massa: 600 campeonatos completos, todos com campeão, vice e 3º lugar distintos", () => {
  let withManualTie = 0;
  const total = 600;
  for (let seed = 1; seed <= total; seed += 1) {
    const report = runFullSimulation({ seed });
    assert.equal(report.status, "SIMULAÇÃO APROVADA", "seed " + seed + ": " + report.errors.join(" | "));
    const podium = [report.final.championTeamName, report.final.runnerUpTeamName, report.final.thirdPlaceTeamName];
    assert.ok(podium.every(Boolean));
    assert.equal(new Set(podium).size, 3);
    if (report.groups.some((group) => group.tieResolvedManually)) withManualTie += 1;
  }
  // Com o confronto direto, o empate que sobra para o administrador é a exceção (o triângulo).
  assert.ok(withManualTie < total * 0.35, withManualTie + " de " + total + " simulações precisaram de decisão manual");
});

test("empate exato na simulação é decidido no lugar do administrador e fica avisado no relatório", () => {
  let found = false;
  for (let seed = 1; seed <= 200 && !found; seed += 1) {
    const report = runFullSimulation({ seed });
    if (!report.groups.some((group) => group.tieResolvedManually)) continue;
    found = true;
    assert.equal(report.status, "SIMULAÇÃO APROVADA");
    assert.ok(report.warnings.some((warning) => /empate exato/.test(warning) && /no lugar do administrador/.test(warning) && /confronto direto/.test(warning)));
    assert.ok(report.groups.every((group) => group.standings.every((row) => !row.tiePending)));
  }
  assert.ok(found, "nenhuma das 200 seeds produziu empate exato — revise o teste");
});
