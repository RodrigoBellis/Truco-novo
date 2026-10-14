import test from "node:test";
import assert from "node:assert/strict";
import {
  BRACKET_ROUND_LABEL,
  KNOCKOUT_PLAN,
  PHASE_FINISHED,
  PHASE_GROUPS,
  PHASE_KNOCKOUT,
  computeGroupStandings,
  groupStageOutcome,
  isEditionFinished,
  planKnockoutSync,
  planResultChange,
  type BracketMatch,
  type EditionChampionRecord,
  type KnockoutKey,
  type KnockoutStep,
  type Match,
  type MatchResult,
  type StandingOverride,
} from "@truco/shared";
import { editionFinishedBlocks } from "./matchAuthorization.js";

// Fixtures fictícias, só em memória: um "mundo" mínimo onde os passos do plano são aplicados.
// Formato de 14/10/2026: grupo único de 7 duplas (a1..a7), 21 jogos, 6 jogos de mata-mata.
type Game = { teamAId: string; teamBId: string; result: MatchResult | null };

interface World {
  games: Game[];
  overrides: StandingOverride[];
  bracket: BracketMatch[];
  matches: Match[];
  phase: string;
  champion: EditionChampionRecord | null;
  log: KnockoutStep["type"][];
}

const ids = [1, 2, 3, 4, 5, 6, 7].map((index) => "a" + index);

/** Grupo sem empate: a1 vence todos, a2 só perde para a1, e assim por diante. */
function cleanGames(): Game[] {
  const games: Game[] = [];
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) games.push({ teamAId: ids[i], teamBId: ids[j], result: { setsA: 2, setsB: 0 } });
  return games;
}

function newWorld(): World {
  return { games: cleanGames(), overrides: [], bracket: [], matches: [], phase: PHASE_GROUPS, champion: null, log: [] };
}

let counter = 0;
const newId = () => "id-" + (counter += 1);

const snapshot = (world: World) => ({
  standings: { A: computeGroupStandings(ids, world.games, world.overrides) },
  bracket: world.bracket,
  knockoutMatches: world.matches,
  groupOf: () => "A" as const,
  phase: world.phase,
  champion: world.champion,
});

function apply(world: World, step: KnockoutStep): void {
  world.log.push(step.type);
  if (step.type === "clear-knockout") {
    world.bracket = [];
    world.matches = world.matches.filter((match) => match.result);
  } else if (step.type === "create-bracket") {
    world.bracket = step.rows.map((row) => ({ ...row }));
  } else if (step.type === "create-match") {
    const match: Match = { id: newId(), championshipId: "edicao", stage: "mata-mata", round: step.round, order: step.order, groupId: null, teamAId: step.teamAId, teamBId: step.teamBId, result: null, status: "pendente", tableNumber: null, blockNumber: null, queuePosition: null };
    world.matches.push(match);
    world.bracket.find((item) => item.id === step.bracketMatchId)!.matchId = match.id;
  } else if (step.type === "link-match") {
    world.bracket.find((item) => item.id === step.bracketMatchId)!.matchId = step.matchId;
  } else if (step.type === "delete-match") {
    world.matches = world.matches.filter((match) => match.id !== step.matchId);
    world.bracket.forEach((item) => { if (item.matchId === step.matchId) item.matchId = null; });
  } else if (step.type === "set-match-team") {
    const match = world.matches.find((item) => item.id === step.matchId)!;
    if (step.side === "A") match.teamAId = step.teamId; else match.teamBId = step.teamId;
  } else if (step.type === "record-champion") {
    world.champion = { championTeamId: step.championTeamId, runnerUpTeamId: step.runnerUpTeamId, finalResult: step.finalResult };
  } else {
    world.phase = step.phase;
  }
}

/** Planeja e aplica até não sobrar passo, como o serviço real faz. Devolve as anomalias da última passada. */
function sync(world: World): string[] {
  for (let pass = 0; pass < 12; pass += 1) {
    const plan = planKnockoutSync(snapshot(world), newId);
    if (plan.steps.length === 0) return plan.anomalies;
    plan.steps.forEach((step) => apply(world, step));
  }
  throw new Error("o plano não convergiu");
}

const entry = (world: World, key: KnockoutKey) => {
  const fixture = KNOCKOUT_PLAN.find((item) => item.key === key)!;
  return world.bracket.find((item) => item.round === fixture.round && item.order === fixture.order)!;
};
const game = (world: World, key: KnockoutKey) => world.matches.find((match) => match.id === entry(world, key)?.matchId);
const pair = (world: World, key: KnockoutKey) => { const match = game(world, key); return match ? [match.teamAId, match.teamBId] : null; };
function play(world: World, key: KnockoutKey, setsA: number, setsB: number): void {
  const match = game(world, key)!;
  match.result = { setsA, setsB };
  match.status = "realizado";
}
const setGroupGame = (world: World, teamAId: string, teamBId: string, result: MatchResult | null) => {
  world.games.find((item) => item.teamAId === teamAId && item.teamBId === teamBId)!.result = result;
};
/** Triângulo: a1 vence a2, a2 vence a3 e a3 vence a1, tudo por 2x0 — iguais nos cinco critérios. */
const makeTriangle = (world: World) => setGroupGame(world, "a1", "a3", { setsA: 0, setsB: 2 });

// ---------- Geração automática ----------

test("enquanto faltar jogo da fase de grupos, nada do mata-mata é gerado", () => {
  const world = newWorld();
  setGroupGame(world, "a6", "a7", null);
  assert.equal(groupStageOutcome(snapshot(world).standings).status, "em-andamento");
  sync(world);
  assert.deepEqual([world.bracket.length, world.matches.length, world.phase, world.log], [0, 0, PHASE_GROUPS, []]);
});

test("grupo com menos de sete duplas não conta como encerrado, mesmo com todos os jogos feitos", () => {
  const six = computeGroupStandings(ids.slice(0, 6), cleanGames().filter((item) => item.teamAId !== "a7" && item.teamBId !== "a7"));
  assert.equal(groupStageOutcome({ A: six }).status, "em-andamento");
});

test("com os 21 jogos lançados e sem empate, o chaveamento e as duas quartas nascem sozinhos", () => {
  const world = newWorld();
  sync(world);
  assert.equal(world.bracket.length, 6);
  assert.deepEqual(pair(world, "Q1"), ["a3", "a6"]);
  assert.deepEqual(pair(world, "Q2"), ["a4", "a5"]);
  assert.equal(world.matches.length, 2, "só as quartas têm adversários conhecidos");
  assert.deepEqual(world.matches.map((match) => match.round), [BRACKET_ROUND_LABEL.quartas, BRACKET_ROUND_LABEL.quartas]);
  assert.equal(world.phase, PHASE_KNOCKOUT);
  // 1º e 2º direto na semifinal, 7º fora de tudo.
  assert.deepEqual([entry(world, "S1").slotA, entry(world, "S2").slotA], [{ type: "direct", teamId: "a1" }, { type: "direct", teamId: "a2" }]);
  assert.ok(!JSON.stringify(world.bracket).includes("a7"));

  // Idempotente: rodar de novo não cria nem muda nada.
  const before = JSON.stringify([world.bracket, world.matches]);
  world.log = [];
  sync(world);
  assert.deepEqual([world.log, JSON.stringify([world.bracket, world.matches])], [[], before]);
});

// ---------- Empate absoluto ----------

test("empate absoluto não gera mata-mata; a decisão do administrador gera na mesma rodada", () => {
  const world = newWorld();
  makeTriangle(world);
  const outcome = groupStageOutcome(snapshot(world).standings);
  assert.deepEqual([outcome.status, outcome.pendingTieGroups], ["empate-pendente", ["A"]]);
  sync(world);
  assert.deepEqual([world.bracket.length, world.matches.length, world.phase], [0, 0, PHASE_GROUPS]);

  // O administrador decide a ordem: a2, a3, a1.
  world.overrides = [{ teamId: "a2", position: 1 }, { teamId: "a3", position: 2 }, { teamId: "a1", position: 3 }];
  sync(world);
  assert.equal(world.bracket.length, 6);
  assert.deepEqual([entry(world, "S1").slotA, entry(world, "S2").slotA], [{ type: "direct", teamId: "a2" }, { type: "direct", teamId: "a3" }]);
  assert.deepEqual(pair(world, "Q1"), ["a1", "a6"]);
});

// ---------- Correção de placar de grupo depois que o mata-mata nasceu ----------

const groupMatch = (teamAId: string, teamBId: string): Match => ({ id: "g", championshipId: "edicao", stage: "grupos", round: "Grupo A", order: 0, groupId: "A", teamAId, teamBId, result: { setsA: 2, setsB: 0 }, status: "realizado", tableNumber: null, blockNumber: null, queuePosition: null });

test("correção de grupo é aceita enquanto nenhum jogo do mata-mata tem placar, e recusada depois", () => {
  const world = newWorld();
  sync(world);
  const correction = { setsA: 0, setsB: 2 };
  assert.equal(planResultChange(groupMatch("a3", "a4"), correction, world.bracket, world.matches).blocked, null);
  play(world, "Q1", 2, 1);
  const blocked = planResultChange(groupMatch("a3", "a4"), correction, world.bracket, world.matches).blocked ?? "";
  assert.match(blocked, /Quartas 1/);
  assert.match(blocked, /não podem mais ser alterados/);
  // Vale para qualquer jogo de grupo, inclusive os de quem foi eliminado.
  assert.ok(planResultChange(groupMatch("a6", "a7"), correction, world.bracket, world.matches).blocked);
});

test("correção de grupo que muda a classificação desfaz o chaveamento e refaz sem duplicar", () => {
  const world = newWorld();
  sync(world);
  const oldBracketIds = world.bracket.map((item) => item.id);
  const oldMatchIds = world.matches.map((match) => match.id);
  // a4 passa a vencer a3: os dois trocam de posição (3º e 4º).
  setGroupGame(world, "a3", "a4", { setsA: 0, setsB: 2 });
  world.log = [];
  sync(world);
  assert.deepEqual(world.log.slice(0, 2), ["clear-knockout", "create-bracket"]);
  assert.equal(world.bracket.length, 6);
  assert.equal(world.matches.length, 2);
  assert.deepEqual(pair(world, "Q1"), ["a4", "a6"]);
  assert.deepEqual(pair(world, "Q2"), ["a3", "a5"]);
  assert.ok(world.bracket.every((item) => !oldBracketIds.includes(item.id)) && world.matches.every((match) => !oldMatchIds.includes(match.id)), "nada do chaveamento antigo sobrou");
  assert.equal(world.phase, PHASE_KNOCKOUT);
});

test("correção de grupo que não muda nenhuma posição mantém o chaveamento como está", () => {
  const world = newWorld();
  sync(world);
  const before = JSON.stringify([world.bracket, world.matches]);
  setGroupGame(world, "a1", "a7", { setsA: 2, setsB: 1 });
  world.log = [];
  sync(world);
  assert.deepEqual([world.log, JSON.stringify([world.bracket, world.matches])], [[], before]);
});

test("correção de grupo que reabre um empate absoluto remove o mata-mata e volta à exceção", () => {
  const world = newWorld();
  sync(world);
  makeTriangle(world);
  sync(world);
  assert.deepEqual([world.bracket.length, world.matches.length, world.phase], [0, 0, PHASE_GROUPS]);
  assert.deepEqual(planKnockoutSync(snapshot(world), newId).pendingTieGroups, ["A"]);
});

test("classificação diferente do chaveamento com placar de mata-mata já lançado: nada é mexido e a anomalia é relatada", () => {
  const world = newWorld();
  sync(world);
  play(world, "Q1", 2, 0);
  setGroupGame(world, "a3", "a4", { setsA: 0, setsB: 2 });
  const before = JSON.stringify([world.bracket, world.matches]);
  const plan = planKnockoutSync(snapshot(world), newId);
  assert.deepEqual(plan.steps, []);
  assert.equal(plan.anomalies.length, 1);
  assert.equal(JSON.stringify([world.bracket, world.matches]), before);
});

// ---------- Avanço automático ----------

test("quartas → semifinais → final e 3º lugar → campeão, cada fase nascendo da anterior", () => {
  const world = newWorld();
  sync(world);
  play(world, "Q1", 2, 0);
  sync(world);
  assert.deepEqual(pair(world, "S2"), ["a2", "a3"]);
  assert.equal(game(world, "S1"), undefined, "a Semifinal 1 espera as Quartas 2");
  play(world, "Q2", 0, 2);
  sync(world);
  assert.deepEqual(pair(world, "S1"), ["a1", "a5"]);

  play(world, "S1", 2, 0);
  sync(world);
  assert.equal(game(world, "F"), undefined, "a final espera as duas semifinais");
  assert.equal(game(world, "T"), undefined, "o 3º lugar também espera as duas semifinais");
  play(world, "S2", 1, 2);
  sync(world);
  assert.deepEqual(pair(world, "F"), ["a1", "a3"]);
  assert.deepEqual(pair(world, "T"), ["a5", "a2"]);
  assert.deepEqual(game(world, "T")!.round, BRACKET_ROUND_LABEL.terceiro);
  assert.deepEqual([world.phase, world.champion], [PHASE_KNOCKOUT, null]);

  play(world, "F", 2, 1);
  sync(world);
  assert.deepEqual(world.champion, { championTeamId: "a1", runnerUpTeamId: "a3", finalResult: "2x1" });
  assert.equal(world.phase, PHASE_KNOCKOUT, "campeão registrado, mas a edição espera o 3º lugar");
  play(world, "T", 0, 2);
  sync(world);
  assert.equal(world.phase, PHASE_FINISHED);
  assert.deepEqual([world.bracket.length, world.matches.length], [6, 6]);
});

function finishedWorld(): World {
  const world = newWorld();
  sync(world);
  for (const key of ["Q1", "Q2", "S1", "S2", "F", "T"] as KnockoutKey[]) {
    play(world, key, 2, 0);
    sync(world);
  }
  return world;
}

test("campeão é registrado uma vez: rodar de novo não repete, e a correção da final leva o histórico junto", () => {
  const world = finishedWorld();
  assert.deepEqual(world.champion, { championTeamId: "a1", runnerUpTeamId: "a2", finalResult: "2x0" });
  assert.equal(world.log.filter((step) => step === "record-champion").length, 1);
  world.log = [];
  sync(world);
  assert.deepEqual(world.log, []);

  // Mesmo vencedor, outro placar: o histórico acompanha o placar.
  play(world, "F", 2, 1);
  sync(world);
  assert.deepEqual(world.champion, { championTeamId: "a1", runnerUpTeamId: "a2", finalResult: "2x1" });
  // Vencedor trocado: campeão e vice se invertem; continua uma linha só.
  play(world, "F", 0, 2);
  sync(world);
  assert.deepEqual(world.champion, { championTeamId: "a2", runnerUpTeamId: "a1", finalResult: "2x0" });
  assert.equal(world.phase, PHASE_FINISHED);
});

test("correção do 3º lugar depois de encerrado não mexe no campeão nem reabre a edição", () => {
  const world = finishedWorld();
  const champion = world.champion;
  play(world, "T", 0, 2);
  world.log = [];
  sync(world);
  assert.deepEqual(world.log, []);
  assert.deepEqual([world.champion, world.phase], [champion, PHASE_FINISHED]);
});

test("edição encerrada bloqueia jogador e não bloqueia administrador", () => {
  assert.equal(isEditionFinished(PHASE_FINISHED), true);
  assert.equal(isEditionFinished(PHASE_KNOCKOUT), false);
  assert.equal(isEditionFinished(undefined), false);
  assert.equal(editionFinishedBlocks("jogador", PHASE_FINISHED), true);
  assert.equal(editionFinishedBlocks(null, PHASE_FINISHED), true);
  assert.equal(editionFinishedBlocks("admin", PHASE_FINISHED), false);
  assert.equal(editionFinishedBlocks("superadmin", PHASE_FINISHED), false);
  assert.equal(editionFinishedBlocks("jogador", PHASE_KNOCKOUT), false);
});

// ---------- Auto-reparo ----------

test("jogo criado sem vínculo (falha no meio) é adotado na rodada seguinte, sem duplicar", () => {
  const world = newWorld();
  sync(world);
  const q1 = entry(world, "Q1");
  const orphanId = q1.matchId!;
  q1.matchId = null; // o jogo foi criado, mas o vínculo com o chaveamento não chegou a ser gravado
  world.log = [];
  sync(world);
  assert.deepEqual(world.log, ["link-match"]);
  assert.equal(entry(world, "Q1").matchId, orphanId);
  assert.equal(world.matches.length, 2);
});

test("vencedor de semifinal corrigido sem o reparo: a rodada seguinte troca as duplas da final e do 3º lugar", () => {
  const world = newWorld();
  sync(world);
  for (const key of ["Q1", "Q2", "S1", "S2"] as KnockoutKey[]) { play(world, key, 2, 0); sync(world); }
  assert.deepEqual([pair(world, "F"), pair(world, "T")], [["a1", "a2"], ["a4", "a3"]]);
  play(world, "S1", 0, 2); // placar salvo, reparo não executado
  world.log = [];
  sync(world);
  assert.deepEqual(world.log, ["set-match-team", "set-match-team"]);
  assert.deepEqual([pair(world, "F"), pair(world, "T")], [["a4", "a2"], ["a1", "a3"]]);
});

test("chaveamento apagado pela metade (sobraram jogos pendentes sem chaveamento) é refeito limpo", () => {
  const world = newWorld();
  sync(world);
  world.bracket = []; // a remoção parou depois de apagar o chaveamento
  sync(world);
  assert.equal(world.bracket.length, 6);
  assert.equal(world.matches.length, 2);
  assert.ok(world.matches.every((match) => world.bracket.some((item) => item.matchId === match.id)));
});

test("chaveamento com confronto duplicado e sem placar é desfeito e refeito com seis confrontos", () => {
  const world = newWorld();
  sync(world);
  world.bracket.push({ ...entry(world, "Q1"), id: "duplicado", matchId: null });
  sync(world);
  assert.equal(world.bracket.length, 6);
  assert.equal(world.matches.length, 2);
});

// ---------- Fase de grupos sem ordem obrigatória ----------

test("o grupo único tem exatamente os 21 confrontos distintos, cada par uma única vez", async () => {
  const { generateGroupMatches } = await import("./groupMatchesService.js");
  const pairs = generateGroupMatches(ids);
  assert.equal(pairs.length, 21);
  assert.equal(new Set(pairs.map((item) => [item.teamAId, item.teamBId].sort().join(" x "))).size, 21);
  assert.ok(pairs.every((item) => item.teamAId !== item.teamBId));
  for (const teamId of ids) assert.equal(pairs.filter((item) => item.teamAId === teamId || item.teamBId === teamId).length, 6);
  assert.throws(() => generateGroupMatches(ids.slice(0, 5)), RangeError);
});

test("a ordem dos lançamentos não importa: com 20 resultados em qualquer ordem nada é gerado; o 21º, seja qual for, gera", () => {
  let seed = 20261025;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let round = 0; round < 40; round += 1) {
    const world = newWorld();
    const all = world.games.map((item) => ({ game: item, result: item.result }));
    all.forEach((item) => { item.game.result = null; });
    for (let index = all.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [all[index], all[other]] = [all[other], all[index]];
    }
    all.forEach((item, index) => {
      item.game.result = item.result;
      sync(world);
      assert.equal(world.bracket.length, index === all.length - 1 ? 6 : 0, `rodada ${round}, ${index + 1} resultados`);
    });
    assert.deepEqual([world.matches.length, world.phase], [2, PHASE_KNOCKOUT]);
  }
});
