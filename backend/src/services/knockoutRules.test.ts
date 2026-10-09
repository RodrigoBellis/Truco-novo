import test from "node:test";
import assert from "node:assert/strict";
import {
  KNOCKOUT_PLAN,
  STANDINGS_CRITERIA,
  buildKnockoutBracket,
  buildKnockoutView,
  computeGroupStandings,
  decideQuarterfinalPairing,
  describeKnockoutSlot,
  knockoutChampion,
  pendingTieClusters,
  qualificationForPosition,
  settleQuarterfinals,
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
  const teamIds = [1, 2, 3, 4, 5].map((index) => prefix + index);
  const rows: Game[] = [];
  for (let i = 0; i < teamIds.length; i += 1) for (let j = i + 1; j < teamIds.length; j += 1) rows.push([teamIds[i], teamIds[j], 2, 0]);
  return { teamIds, matches: games(rows) };
};

// ---------- Classificação e desempate ----------

test("ordem oficial dos critérios: pontos, vitórias, vitórias por 2x0, confronto direto e saldo de quedas", () => {
  assert.deepEqual([...STANDINGS_CRITERIA], ["pontos", "vitórias", "vitórias por 2x0", "confronto direto", "saldo de quedas"]);
});

test("1º vai direto para a semifinal, 2º para as quartas, 3º e 4º para a repescagem e 5º é eliminado", () => {
  const { teamIds, matches } = cleanGroup("a");
  const rows = computeGroupStandings(teamIds, matches);
  assert.deepEqual(rows.map((row) => row.teamId), ["a1", "a2", "a3", "a4", "a5"]);
  assert.deepEqual(
    rows.map((row) => [row.position, qualificationForPosition(row.position, rows.length)]),
    [[1, "semifinal"], [2, "quartas"], [3, "repescagem"], [4, "repescagem"], [5, "eliminado"]],
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
  // 4º vai à repescagem e 5º é eliminado: aqui o confronto direto decidiu quem segue no campeonato.
  assert.deepEqual([qualificationForPosition(b.position), qualificationForPosition(a.position)], ["repescagem", "eliminado"]);
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

const teamAt = (group: GroupId, position: number) => group.toLowerCase() + position;
const groupOf = (teamId: string): GroupId => (teamId.startsWith("a") ? "A" : "B");
const newIds = () => {
  let counter = 0;
  return () => "bracket-" + (counter += 1);
};

test("plano oficial: repescagem A3×B4 e B3×A4, quartas com os 2º colocados, semifinais com os líderes", () => {
  const labels = KNOCKOUT_PLAN.map((fixture) => [fixture.key, describeKnockoutSlot(fixture.slotA), describeKnockoutSlot(fixture.slotB)]);
  assert.deepEqual(labels, [
    ["R1", "3º do Grupo A", "4º do Grupo B"],
    ["R2", "3º do Grupo B", "4º do Grupo A"],
    // Qual vencedor cai em cada jogo das quartas só se sabe depois das duas repescagens.
    ["Q1", "2º do Grupo A", "Vencedor da repescagem"],
    ["Q2", "2º do Grupo B", "Vencedor da repescagem"],
    ["S1", "1º do Grupo A", "Vencedor das Quartas 2"],
    ["S2", "1º do Grupo B", "Vencedor das Quartas 1"],
    ["F", "Vencedor da Semifinal 1", "Vencedor da Semifinal 2"],
  ]);
  assert.deepEqual(KNOCKOUT_PLAN.map((fixture) => fixture.round), ["repescagem", "repescagem", "quartas", "quartas", "semifinal", "semifinal", "final"]);
});

test("o 5º colocado de cada grupo não entra em nenhum confronto do mata-mata", () => {
  const bracket = buildKnockoutBracket(teamAt, newIds());
  const direct = bracket.flatMap((item) => [item.slotA, item.slotB]).flatMap((slot) => (slot.type === "direct" ? [slot.teamId] : []));
  assert.deepEqual([...direct].sort(), ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4"]);
  assert.throws(() => buildKnockoutBracket((group, position) => (position === 4 ? null : teamAt(group, position)), newIds()), RangeError);
});

test("cruzamento das quartas: os quatro desfechos possíveis da repescagem", () => {
  // R1 = 3º A × 4º B · R2 = 3º B × 4º A. Quartas 1 tem o 2º A; Quartas 2 tem o 2º B.
  // Vencem os dois 3º colocados: padrão, sem reencontro (2º A × 3º B, 2º B × 3º A).
  assert.deepEqual(decideQuarterfinalPairing("A", "B"), { swapped: false, rematches: 0, avoided: 0, inevitable: false });
  // Vencem os dois 4º colocados: o padrão daria 2º A × 4º A e 2º B × 4º B. Troca e evita os dois.
  assert.deepEqual(decideQuarterfinalPairing("B", "A"), { swapped: true, rematches: 0, avoided: 2, inevitable: false });
  // Os dois vencedores são do Grupo A: um deles pega o 2º A de qualquer jeito.
  assert.deepEqual(decideQuarterfinalPairing("A", "A"), { swapped: false, rematches: 1, avoided: 0, inevitable: true });
  // Os dois vencedores são do Grupo B: idem com o 2º B.
  assert.deepEqual(decideQuarterfinalPairing("B", "B"), { swapped: false, rematches: 1, avoided: 0, inevitable: true });
});

type Played = { id: string; teamAId: string; teamBId: string; result: MatchResult | null };

/**
 * Disputa o mata-mata inteiro em memória pela mesma regra de progressão do sistema: as quartas
 * só são montadas com as duas repescagens encerradas e pelo cruzamento de settleQuarterfinals.
 */
function playKnockout(wins: (key: KnockoutKey, teamAId: string, teamBId: string) => MatchResult) {
  const bracket: BracketMatch[] = buildKnockoutBracket(teamAt, newIds());
  const matches: Played[] = [];
  const keyOf = (item: BracketMatch) => KNOCKOUT_PLAN.find((fixture) => fixture.round === item.round && fixture.order === item.order)!.key;
  const winnerOf = (bracketMatchId: string) => {
    const source = bracket.find((item) => item.id === bracketMatchId)!;
    const match = matches.find((item) => item.id === source.matchId);
    if (!match?.result) return null;
    return match.result.setsA > match.result.setsB ? match.teamAId : match.teamBId;
  };
  const view = () => buildKnockoutView({ bracket, matches, teamName: (teamId) => teamId.toUpperCase(), groupOf });
  const snapshots: Record<string, ReturnType<typeof buildKnockoutView>> = {};
  let pairing: ReturnType<typeof decideQuarterfinalPairing> | null = null;

  for (const round of ["repescagem", "quartas", "semifinal", "final"] as const) {
    if (round === "quartas") {
      const settlement = settleQuarterfinals(bracket, matches, groupOf);
      assert.ok(settlement, "com as duas repescagens encerradas o cruzamento precisa sair");
      pairing = settlement.pairing;
      settlement.slots.forEach(({ bracketMatchId, slotB }) => { bracket.find((item) => item.id === bracketMatchId)!.slotB = slotB; });
    }
    bracket.filter((item) => item.round === round).forEach((item) => {
      const teamAId = item.slotA.type === "direct" ? item.slotA.teamId : item.slotA.type === "winner" ? winnerOf(item.slotA.bracketMatchId) : null;
      const teamBId = item.slotB.type === "direct" ? item.slotB.teamId : item.slotB.type === "winner" ? winnerOf(item.slotB.bracketMatchId) : null;
      assert.ok(teamAId && teamBId, item.label + " precisa das duas duplas definidas");
      item.matchId = "match-" + keyOf(item);
      matches.push({ id: item.matchId, teamAId, teamBId, result: null });
    });
    snapshots["antes-" + round] = view();
    matches.filter((match) => !match.result).forEach((match) => {
      match.result = wins(match.id.replace("match-", "") as KnockoutKey, match.teamAId, match.teamBId);
    });
  }
  return { view: view(), snapshots, pairing: pairing!, bracket, matches };
}

const byKey = (list: ReturnType<typeof buildKnockoutView>, key: KnockoutKey) => list.find((item) => item.key === key)!;
const pair = (list: ReturnType<typeof buildKnockoutView>, key: KnockoutKey) => [byKey(list, key).sideA.teamId, byKey(list, key).sideB.teamId];
const sideAWins: MatchResult = { setsA: 2, setsB: 0 };
const sideBWins: MatchResult = { setsA: 1, setsB: 2 };

test("as quartas só são montadas depois das duas repescagens", () => {
  const bracket = buildKnockoutBracket(teamAt, newIds());
  bracket.filter((item) => item.round === "repescagem").forEach((item, index) => { item.matchId = "match-R" + (index + 1); });
  const matches: Played[] = [
    { id: "match-R1", teamAId: "a3", teamBId: "b4", result: sideAWins },
    { id: "match-R2", teamAId: "b3", teamBId: "a4", result: null },
  ];
  assert.equal(settleQuarterfinals(bracket, matches, groupOf), null, "falta a Repescagem 2");
  matches[1].result = sideAWins;
  assert.deepEqual(settleQuarterfinals(bracket, matches, groupOf)?.pairing, { swapped: false, rematches: 0, avoided: 0, inevitable: false });
});

test("repescagem: vencem os 3º colocados — quartas no cruzamento padrão, sem reencontro", () => {
  const { snapshots, pairing, view } = playKnockout(() => sideAWins);
  const before = snapshots["antes-quartas"];
  assert.deepEqual(pair(before, "R1"), ["a3", "b4"]);
  assert.deepEqual(pair(before, "R2"), ["b3", "a4"]);
  assert.deepEqual(pair(before, "Q1"), ["a2", "b3"]);
  assert.deepEqual(pair(before, "Q2"), ["b2", "a3"]);
  assert.deepEqual([pairing.swapped, pairing.rematches, pairing.avoided], [false, 0, 0]);
  assert.deepEqual([byKey(before, "Q1").sameGroup, byKey(before, "Q2").sameGroup], [false, false]);
  // A origem mostrada na tela é a que ficou gravada.
  assert.deepEqual([byKey(before, "Q1").sideB.placeholder, byKey(before, "Q2").sideB.placeholder], ["Vencedor da Repescagem 2", "Vencedor da Repescagem 1"]);
  // Os 2º colocados não jogaram a repescagem.
  const repechage = [...pair(view, "R1"), ...pair(view, "R2")];
  assert.ok(!repechage.includes("a2") && !repechage.includes("b2"));
});

test("repescagem: vencem os 4º colocados — o cruzamento é trocado e evita dois reencontros", () => {
  const { snapshots, pairing } = playKnockout((key) => (key.startsWith("R") ? sideBWins : sideAWins));
  const before = snapshots["antes-quartas"];
  // Sem a troca seria 2º A × 4º A e 2º B × 4º B.
  assert.deepEqual(pair(before, "Q1"), ["a2", "b4"]);
  assert.deepEqual(pair(before, "Q2"), ["b2", "a4"]);
  assert.deepEqual(pairing, { swapped: true, rematches: 0, avoided: 2, inevitable: false });
  assert.deepEqual([byKey(before, "Q1").sameGroup, byKey(before, "Q2").sameGroup], [false, false]);
  assert.deepEqual([byKey(before, "Q1").sideB.placeholder, byKey(before, "Q2").sideB.placeholder], ["Vencedor da Repescagem 1", "Vencedor da Repescagem 2"]);
});

test("repescagem: os dois vencedores são do Grupo A — um reencontro é inevitável e fica registrado", () => {
  // R1: 3º A vence · R2: 4º A vence.
  const { snapshots, pairing } = playKnockout((key) => (key === "R2" ? sideBWins : sideAWins));
  const before = snapshots["antes-quartas"];
  assert.deepEqual(pair(before, "Q1"), ["a2", "a4"]);
  assert.deepEqual(pair(before, "Q2"), ["b2", "a3"]);
  assert.deepEqual(pairing, { swapped: false, rematches: 1, avoided: 0, inevitable: true });
  // O reencontro aparece marcado; nenhuma dupla é forçada para um confronto errado.
  assert.deepEqual([byKey(before, "Q1").sameGroup, byKey(before, "Q2").sameGroup], [true, false]);
});

test("repescagem: os dois vencedores são do Grupo B — um reencontro é inevitável e fica registrado", () => {
  // R1: 4º B vence · R2: 3º B vence.
  const { snapshots, pairing } = playKnockout((key) => (key === "R1" ? sideBWins : sideAWins));
  const before = snapshots["antes-quartas"];
  assert.deepEqual(pair(before, "Q1"), ["a2", "b3"]);
  assert.deepEqual(pair(before, "Q2"), ["b2", "b4"]);
  assert.deepEqual(pairing, { swapped: false, rematches: 1, avoided: 0, inevitable: true });
  assert.deepEqual([byKey(before, "Q1").sameGroup, byKey(before, "Q2").sameGroup], [false, true]);
});

test("vencedores das quartas chegam à semifinal, onde os 1º colocados já esperam", () => {
  // Lado A vence sempre: R1 → a3, R2 → b3, Q1 → a2, Q2 → b2.
  const { view, snapshots } = playKnockout(() => sideAWins);
  const before = snapshots["antes-semifinal"];
  assert.deepEqual(pair(before, "S1"), ["a1", "b2"]);
  assert.deepEqual(pair(before, "S2"), ["b1", "a2"]);
  // Os líderes só aparecem a partir da semifinal.
  const earlier = (["R1", "R2", "Q1", "Q2"] as KnockoutKey[]).flatMap((key) => pair(view, key));
  assert.ok(!earlier.includes("a1") && !earlier.includes("b1"));
  // Antes da repescagem, a semifinal já mostra o líder de um lado e o vencedor esperado do outro.
  const early = snapshots["antes-repescagem"];
  assert.deepEqual([...pair(early, "S1"), byKey(early, "S1").sideB.placeholder], ["a1", null, "Vencedor das Quartas 2"]);
  assert.deepEqual([...pair(early, "Q1"), byKey(early, "Q1").sideB.placeholder], ["a2", null, "Vencedor da repescagem"]);
});

test("as semifinais geram a final e a final define o campeão", () => {
  const { view, snapshots } = playKnockout((key) => (key === "F" ? sideBWins : { setsA: 2, setsB: 1 }));
  const final = byKey(view, "F");
  const beforeFinal = byKey(snapshots["antes-final"], "F");
  // Semifinais vencidas pelos líderes (lado A): final entre 1º A e 1º B.
  assert.deepEqual([beforeFinal.sideA.teamId, beforeFinal.sideB.teamId, beforeFinal.played], ["a1", "b1", false]);
  assert.equal(knockoutChampion(snapshots["antes-final"]), null);
  assert.deepEqual([final.sideA.sets, final.sideB.sets, final.sideB.winner], [1, 2, true]);
  assert.equal(knockoutChampion(view)?.teamId, "b1");
  assert.equal(view.filter((item) => item.played).length, 7);
});

test("antes de o mata-mata ser gerado, o chaveamento mostra as posições e a ocupação provisória", () => {
  const view = buildKnockoutView({ bracket: [], matches: [], teamName: (teamId) => teamId.toUpperCase(), projected: (group, position) => (group === "A" ? teamAt(group, position) : null) });
  const r1 = byKey(view, "R1");
  assert.deepEqual([r1.sideA.name, r1.sideA.provisional, r1.sideA.placeholder], ["A3", true, "3º do Grupo A"]);
  assert.deepEqual([r1.sideB.name, r1.sideB.provisional, r1.sideB.placeholder], [null, false, "4º do Grupo B"]);
  assert.ok(view.every((item) => !item.played && !item.sameGroup));
});

// ---------- Correção de placar com o mata-mata em andamento ----------

const fixtureMatch = (id: string, stage: Match["stage"], teamAId: string, teamBId: string, result: MatchResult | null): Match => ({
  id, championshipId: "edicao-teste", stage, round: stage, order: 0, groupId: stage === "grupos" ? "A" : null, teamAId, teamBId,
  result, status: result ? "realizado" : "pendente", tableNumber: null, blockNumber: null, queuePosition: null,
});

function bracketWith(matchIds: Partial<Record<KnockoutKey, string>>): BracketMatch[] {
  const bracket = buildKnockoutBracket(teamAt, newIds());
  bracket.forEach((item) => {
    const key = KNOCKOUT_PLAN.find((fixture) => fixture.round === item.round && fixture.order === item.order)!.key;
    item.matchId = matchIds[key] ?? null;
  });
  return bracket;
}

const free = { blocked: null, repair: null, rebuildQuarterfinals: [] };

test("placar de grupo pode ser corrigido até o mata-mata ser gerado, e nunca depois", () => {
  const groupMatch = fixtureMatch("g1", "grupos", "a1", "a2", { setsA: 2, setsB: 0 });
  assert.deepEqual(planResultChange(groupMatch, { setsA: 0, setsB: 2 }, [], []), free);
  const plan = planResultChange(groupMatch, { setsA: 0, setsB: 2 }, bracketWith({ R1: "r1" }), []);
  assert.match(plan.blocked ?? "", /mata-mata já foi gerado/);
  // Nem um lançamento novo de grupo passa depois disso.
  assert.match(planResultChange(fixtureMatch("g2", "grupos", "a1", "a3", null), { setsA: 2, setsB: 1 }, bracketWith({ R1: "r1" }), []).blocked ?? "", /não podem mais ser alterados/);
});

test("no mata-mata, corrigir o placar sem trocar o vencedor é sempre aceito", () => {
  const r2 = fixtureMatch("r2", "mata-mata", "b3", "a4", { setsA: 2, setsB: 0 });
  const q1 = fixtureMatch("q1", "mata-mata", "a2", "b3", { setsA: 2, setsB: 1 });
  assert.deepEqual(planResultChange(r2, { setsA: 2, setsB: 1 }, bracketWith({ R2: "r2", Q1: "q1" }), [r2, q1]), free);
});

test("trocar o vencedor de uma repescagem desfaz as quartas ainda sem placar, para o cruzamento ser decidido de novo", () => {
  const r1 = fixtureMatch("r1", "mata-mata", "a3", "b4", { setsA: 2, setsB: 0 });
  const r2 = fixtureMatch("r2", "mata-mata", "b3", "a4", { setsA: 2, setsB: 0 });
  const q1 = fixtureMatch("q1", "mata-mata", "a2", "b3", null);
  const q2 = fixtureMatch("q2", "mata-mata", "b2", "a3", null);
  const bracket = bracketWith({ R1: "r1", R2: "r2", Q1: "q1", Q2: "q2" });
  const plan = planResultChange(r2, { setsA: 1, setsB: 2 }, bracket, [r1, r2, q1, q2]);
  assert.deepEqual(plan, { blocked: null, repair: null, rebuildQuarterfinals: ["q1", "q2"] });

  // Antes da segunda repescagem as quartas nem existem: a correção passa sem nada a desfazer.
  assert.deepEqual(planResultChange(r1, { setsA: 0, setsB: 2 }, bracketWith({ R1: "r1", R2: "r2" }), [r1, { ...r2, result: null, status: "pendente" }]), free);

  // Com uma das quartas já disputada, o vencedor da repescagem não pode mais mudar.
  const blocked = planResultChange(r2, { setsA: 1, setsB: 2 }, bracket, [r1, r2, { ...q1, result: { setsA: 2, setsB: 0 }, status: "realizado" }, q2]);
  assert.match(blocked.blocked ?? "", /Quartas 1 já foi disputada/);
  assert.deepEqual(blocked.rebuildQuarterfinals, []);
});

test("trocar o vencedor das quartas ajusta a semifinal enquanto ela não tem placar", () => {
  // Quartas 1 alimenta o lado B da Semifinal 2: vencedor corrigido de a2 para b3.
  const q1 = fixtureMatch("q1", "mata-mata", "a2", "b3", { setsA: 2, setsB: 0 });
  const s2 = fixtureMatch("s2", "mata-mata", "b1", "a2", null);
  const bracket = bracketWith({ Q1: "q1", S2: "s2" });
  assert.deepEqual(planResultChange(q1, { setsA: 1, setsB: 2 }, bracket, [q1, s2]), { blocked: null, repair: { matchId: "s2", side: "B", teamId: "b3" }, rebuildQuarterfinals: [] });

  const blocked = planResultChange(q1, { setsA: 1, setsB: 2 }, bracket, [q1, { ...s2, result: { setsA: 2, setsB: 1 }, status: "realizado" }]);
  assert.match(blocked.blocked ?? "", /Semifinal 2 já foi disputada/);
  assert.equal(blocked.repair, null);
});

test("primeiro lançamento de um jogo do mata-mata e correção da final não dependem de jogo seguinte", () => {
  const s1 = fixtureMatch("s1", "mata-mata", "a1", "b2", null);
  assert.deepEqual(planResultChange(s1, { setsA: 2, setsB: 0 }, bracketWith({ S1: "s1" }), [s1]), free);
  const final = fixtureMatch("f", "mata-mata", "a1", "b1", { setsA: 2, setsB: 0 });
  assert.deepEqual(planResultChange(final, { setsA: 0, setsB: 2 }, bracketWith({ F: "f" }), [final]), free);
});

// ---------- Simulação ----------

test("simulação completa segue o chaveamento oficial do início ao campeão em várias seeds", () => {
  for (const seed of [3, 11, 2026, 4242, 90210]) {
    const report = runFullSimulation({ seed });
    assert.equal(report.status, "SIMULAÇÃO APROVADA", "seed " + seed + ": " + report.errors.join(" | "));
    const standings = { A: computeStandings("A"), B: computeStandings("B") };
    const at = (group: GroupId, position: number) => store.getTeam(standings[group].find((row) => row.position === position)!.teamId)!.name;
    const game = (key: KnockoutKey) => byKey(report.knockout, key);
    const winner = (key: KnockoutKey) => (game(key).sideA.winner ? game(key).sideA.name : game(key).sideB.name);

    assert.deepEqual([game("R1").sideA.name, game("R1").sideB.name], [at("A", 3), at("B", 4)]);
    assert.deepEqual([game("R2").sideA.name, game("R2").sideB.name], [at("B", 3), at("A", 4)]);
    // Quartas: os 2º colocados de um lado; do outro, os dois vencedores da repescagem.
    assert.deepEqual([game("Q1").sideA.name, game("Q2").sideA.name], [at("A", 2), at("B", 2)]);
    assert.deepEqual([game("Q1").sideB.name, game("Q2").sideB.name].sort(), [winner("R1"), winner("R2")].sort());
    assert.deepEqual([game("S1").sideA.name, game("S1").sideB.name], [at("A", 1), winner("Q2")]);
    assert.deepEqual([game("S2").sideA.name, game("S2").sideB.name], [at("B", 1), winner("Q1")]);
    assert.deepEqual([game("F").sideA.name, game("F").sideB.name], [winner("S1"), winner("S2")]);
    assert.equal(report.final.championTeamName, winner("F"));

    for (const group of report.groups) {
      assert.deepEqual(group.standings.map((row) => row.zone), ["semifinal", "quartas", "repescagem", "repescagem", "eliminado"]);
      assert.equal(group.qualifiedPlayoff.length, 2);
      // O eliminado não aparece em nenhum confronto.
      assert.ok(report.knockout.every((item) => item.sideA.name !== group.eliminated && item.sideB.name !== group.eliminated));
    }
  }
});

test("simulação em massa: 600 campeonatos sem nenhum reencontro evitável nas quartas", () => {
  let avoided = 0;
  let inevitable = 0;
  let withManualTie = 0;
  const total = 600;
  for (let seed = 1; seed <= total; seed += 1) {
    const report = runFullSimulation({ seed });
    assert.equal(report.status, "SIMULAÇÃO APROVADA", "seed " + seed + ": " + report.errors.join(" | "));
    assert.ok(report.quarterfinals, "seed " + seed + " sem cruzamento registrado");
    const rematches = report.knockout.filter((item) => item.round === "quartas" && item.sameGroup).length;
    // O que sobra de reencontro é exatamente o inevitável: no máximo um, e só quando os dois
    // vencedores da repescagem são do mesmo grupo.
    assert.equal(rematches, report.quarterfinals.rematches);
    assert.equal(rematches > 0, report.quarterfinals.inevitable);
    assert.ok(rematches <= 1);
    const winners = (["R1", "R2"] as KnockoutKey[]).map((key) => {
      const item = byKey(report.knockout, key);
      return store.getTeam((item.sideA.winner ? item.sideA : item.sideB).teamId!)!.groupId;
    });
    assert.equal(report.quarterfinals.inevitable, winners[0] === winners[1]);
    if (report.quarterfinals.inevitable) assert.ok(report.warnings.some((warning) => /Reencontro inevitável nas quartas/.test(warning)));
    avoided += report.quarterfinals.avoided;
    if (report.quarterfinals.inevitable) inevitable += 1;
    if (report.groups.some((group) => group.tieResolvedManually)) withManualTie += 1;
  }
  assert.ok(avoided > 0 && inevitable > 0, "a varredura precisa cobrir trocas e casos inevitáveis");
  // Com o confronto direto, o empate que sobra para o administrador é a exceção (o triângulo).
  assert.ok(withManualTie < total * 0.25, withManualTie + " de " + total + " simulações precisaram de decisão manual");
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
