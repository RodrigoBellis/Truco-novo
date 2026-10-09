import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { BracketMatch, GroupId, HallOfFame, KnockoutStatus, MajorChampionEntry, Match, StandingRow, Team } from "@truco/shared";
import { EDITION_FINISHED_MESSAGE, RESULTS_LOCKED_MESSAGE } from "@truco/shared";

/**
 * A API de verdade (Express, rotas, middlewares, serviços e regras de produção) em MODO ENSAIO:
 * o armazenamento é a memória do processo e nenhuma chamada sai para a internet. Tudo é feito
 * por HTTP, com o login de contas fictícias de duplas diferentes.
 */
process.env.TRUCO_REHEARSAL = "1";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const realFetch = globalThis.fetch;
const outsideCalls: string[] = [];
// Qualquer tentativa de falar com outro servidor (Supabase incluído) é registrada e recusada.
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== "127.0.0.1") {
    outsideCalls.push(url.href);
    throw new Error("chamada externa bloqueada no teste: " + url.href);
  }
  return realFetch(input, init);
}) as typeof fetch;

const { createApp } = await import("../app.js");
const { rehearsalStore, REHEARSAL_PASSWORD } = await import("../data/rehearsalStore.js");
const { recordResult, recordResultUnlocked, ResultPermissionError } = await import("../services/matchService.js");
const { withChampionshipLock } = await import("../utils/championshipLock.js");
const { StoreOperationError } = await import("../data/storeErrors.js");
const { recoverPendingKnockout, syncKnockout } = await import("../services/bracketService.js");
const { createSeededRandom } = await import("../utils/seededRandom.js");
const { createClient } = await import("@supabase/supabase-js");

let server: Server;
let base = "";
const tokens = new Map<string, string>();
const sessions = new Map<string, { token: string; refreshToken: string; userId: string }>();
const ADMIN = "ensaio-admin";
const CHAMPIONSHIP = "ensaio-edicao-5";

interface Reply<T = any> { status: number; body: T }

async function call<T = any>(method: string, path: string, playerId: string | null, payload?: unknown): Promise<Reply<T>> {
  const token = playerId ? tokens.get(playerId) : null;
  const response = await realFetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
}

before(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  const status = await call("GET", "/api/rehearsal/status", null);
  for (const account of status.body.accounts as Array<{ playerId: string }>) {
    const login = await call("POST", "/api/auth/login", null, { playerId: account.playerId, password: REHEARSAL_PASSWORD });
    assert.equal(login.status, 200);
    tokens.set(account.playerId, login.body.token);
    sessions.set(account.playerId, { token: login.body.token, refreshToken: login.body.refreshToken, userId: login.body.user.id });
  }
});

after(() => {
  server.close();
  globalThis.fetch = realFetch;
});

// ---------- Apoio ----------

const team = (group: GroupId, index: number) => `ensaio-dupla-${group.toLowerCase()}${index}`;
const seedOf = (teamId: string) => Number(teamId.at(-1));
let teams: Team[] = [];
const playersOf = (teamId: string) => { const row = teams.find((item) => item.id === teamId)!; return [row.player1Id, row.player2Id]; };
const outsiderOf = (match: Match) => teams.find((item) => item.id !== match.teamAId && item.id !== match.teamBId)!.player1Id;

async function fresh(options: { open?: boolean } = {}): Promise<void> {
  assert.equal((await call("POST", "/api/rehearsal/reset", null)).status, 204);
  teams = (await call<Team[]>("GET", "/api/teams", ADMIN)).body;
  if (options.open !== false) assert.equal((await call("POST", "/api/admin/results-lock", ADMIN, { locked: false })).status, 200);
}

const groupMatches = async () => (await call<Match[]>("GET", "/api/matches?stage=grupos", ADMIN)).body;
const knockoutMatches = async () => (await call<Match[]>("GET", "/api/matches?stage=mata-mata", ADMIN)).body;
const bracket = async (playerId = ADMIN) => (await call<BracketMatch[]>("GET", "/api/bracket", playerId)).body;
const status = async () => (await call<KnockoutStatus>("GET", "/api/bracket/status", ADMIN)).body;
const standings = async (group: GroupId) => (await call<StandingRow[]>("GET", `/api/groups/${group}/standings`, ADMIN)).body;

/** Placar com `winner` vencendo; loserSets = quedas do perdedor (0 ou 1). */
const scoreFor = (match: Match, winner: string, loserSets = 0) => (match.teamAId === winner ? { setsA: 2, setsB: loserSets } : { setsA: loserSets, setsB: 2 });
const post = (match: Pick<Match, "id">, playerId: string | null, score: { setsA: unknown; setsB: unknown }) => call<Match & { message?: string; code?: string }>("POST", `/api/matches/${match.id}/result`, playerId, score);

/** Vence a dupla de menor número (a1 vence todos, a2 só perde para a1...): grupo sem empate. */
const favourite = (match: Match) => (seedOf(match.teamAId) < seedOf(match.teamBId) ? match.teamAId : match.teamBId);

/** Lança os jogos de grupo dados, alternando entre os quatro jogadores de cada partida. */
async function playGroupMatches(matches: Match[], winnerOf: (match: Match) => string = favourite): Promise<void> {
  for (const [index, match] of matches.entries()) {
    const participants = [...playersOf(match.teamAId), ...playersOf(match.teamBId)];
    const reply = await post(match, participants[index % 4], scoreFor(match, winnerOf(match)));
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
  }
}

const key = (item: { round: string; order: number }) => `${item.round}#${item.order}`;
async function knockout(roundLabel: string, order: number): Promise<Match> {
  const match = (await knockoutMatches()).find((item) => item.round === roundLabel && item.order === order);
  assert.ok(match, `jogo ${roundLabel} ${order + 1} deveria existir`);
  return match;
}

/** Invariantes do mata-mata: sete confrontos distintos, no máximo um jogo por confronto, nada solto. */
async function assertKnockoutIntegrity(expectedMatches: number): Promise<void> {
  const rows = await bracket();
  const games = await knockoutMatches();
  assert.equal(rows.length, 7, "o chaveamento tem exatamente 7 confrontos");
  assert.equal(new Set(rows.map(key)).size, 7, "nenhum confronto duplicado");
  assert.equal(games.length, expectedMatches, "quantidade de jogos do mata-mata");
  assert.equal(new Set(games.map(key)).size, games.length, "no máximo um jogo por confronto");
  const linked = rows.flatMap((row) => (row.matchId ? [row.matchId] : []));
  assert.equal(new Set(linked).size, linked.length, "um jogo não pertence a dois confrontos");
  assert.deepEqual([...linked].sort(), games.map((game) => game.id).sort(), "todo jogo do mata-mata está vinculado, e todo vínculo aponta para um jogo existente");
}

const editionFiveRows = async () => (await call<HallOfFame>("GET", "/api/history", null)).body.editions.filter((entry) => entry.edition === 5);

/** Cálculo independente da tabela, direto dos placares, para conferir a classificação da API. */
function independentTable(teamIds: string[], matches: Match[]) {
  return Object.fromEntries(teamIds.map((teamId) => {
    const row = { jogos: 0, vitorias: 0, vitorias2x0: 0, derrotas: 0, pontos: 0, saldoSets: 0 };
    for (const match of matches) {
      if (!match.result || (match.teamAId !== teamId && match.teamBId !== teamId)) continue;
      const mine = match.teamAId === teamId ? match.result.setsA : match.result.setsB;
      const theirs = match.teamAId === teamId ? match.result.setsB : match.result.setsA;
      row.jogos += 1;
      row.saldoSets += mine - theirs;
      if (mine > theirs) {
        row.vitorias += 1;
        if (theirs === 0) row.vitorias2x0 += 1;
        row.pontos += theirs === 0 ? 3 : 2;
      } else {
        row.derrotas += 1;
        row.pontos += mine === 1 ? 1 : 0;
      }
    }
    return [teamId, row];
  }));
}

async function assertStandingsMatchScores(): Promise<void> {
  const matches = await groupMatches();
  for (const group of ["A", "B"] as const) {
    const rows = await standings(group);
    const expected = independentTable(rows.map((row) => row.teamId), matches.filter((match) => match.groupId === group));
    for (const row of rows) {
      const { jogos, vitorias, vitorias2x0, derrotas, pontos, saldoSets } = row;
      assert.deepEqual({ jogos, vitorias, vitorias2x0, derrotas, pontos, saldoSets }, expected[row.teamId], `Grupo ${group}, ${row.teamId}`);
    }
    assert.deepEqual(rows.map((row) => row.position), [1, 2, 3, 4, 5]);
    for (let index = 1; index < rows.length; index += 1) {
      const [above, below] = [rows[index - 1], rows[index]];
      const order = above.pontos - below.pontos || above.vitorias - below.vitorias || above.vitorias2x0 - below.vitorias2x0 || above.confrontoDireto - below.confrontoDireto || above.saldoSets - below.saldoSets;
      assert.ok(order >= 0, `Grupo ${group}: ${above.teamId} não pode estar acima de ${below.teamId}`);
    }
  }
}

/** Fase de grupos inteira com os favoritos vencendo: 1º a1/b1 ... 5º a5/b5, mata-mata gerado. */
async function finishGroupStage(): Promise<void> {
  await playGroupMatches(await groupMatches());
}

/** Lança um jogo do mata-mata pela dupla do lado A (ou B) vencendo, com o primeiro jogador da vencedora. */
async function playKnockout(roundLabel: string, order: number, winnerSide: "A" | "B" = "A"): Promise<Match> {
  const match = await knockout(roundLabel, order);
  const winner = winnerSide === "A" ? match.teamAId : match.teamBId;
  const reply = await post(match, playersOf(winner)[0], scoreFor(match, winner));
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return reply.body;
}

// ---------- 1. Formato da fase de grupos ----------

test("ensaio: semente isolada com 10 duplas, 20 jogadores, 1 admin, cadeado fechado e os 10 confrontos distintos de cada grupo", async () => {
  await fresh({ open: false });
  assert.deepEqual((await call("GET", "/api/health", null)).body, { status: "ok", rehearsal: true });
  assert.equal(teams.length, 10);
  assert.deepEqual(["A", "B"].map((group) => teams.filter((item) => item.groupId === group && item.status === "aprovada").length), [5, 5]);
  assert.equal(new Set(teams.flatMap((item) => [item.player1Id, item.player2Id])).size, 20);
  assert.equal((await call("GET", "/api/players/roster", null)).body.length, 20, "só os 20 participantes aparecem no login");
  assert.deepEqual((await call("GET", "/api/matches/lock", team("A", 1) && playersOf(team("A", 1))[0])).body, { locked: true });

  const matches = await groupMatches();
  assert.equal(matches.length, 20);
  for (const group of ["A", "B"] as const) {
    const own = matches.filter((match) => match.groupId === group);
    const pairs = own.map((match) => [match.teamAId, match.teamBId].sort().join(" x "));
    assert.equal(own.length, 10);
    assert.equal(new Set(pairs).size, 10, "todo par uma única vez");
    for (const item of teams.filter((row) => row.groupId === group)) {
      assert.equal(own.filter((match) => match.teamAId === item.id || match.teamBId === item.id).length, 4, "cada dupla joga contra as outras quatro");
    }
    assert.ok(own.every((match) => match.teamAId !== match.teamBId && match.result === null && match.status === "pendente"));
  }
  assert.deepEqual(await bracket(), []);
  assert.deepEqual(await knockoutMatches(), []);
  const history = (await call<HallOfFame>("GET", "/api/history", null)).body;
  assert.deepEqual(history.editions.map((entry) => entry.edition), [1, 2, 3, 4]);
  assert.ok(history.editions.every((entry) => entry.champions.every((name) => /^Jogador \d+$/.test(name))), "histórico fictício, sem nomes reais");
  // Sessão inválida e senha errada.
  assert.equal((await call("GET", "/api/teams", null)).status, 401);
  assert.equal((await realFetch(base + "/api/teams", { headers: { Authorization: "Bearer " + tokens.get(ADMIN)!.slice(0, -3) + "abc" } })).status, 401);
  assert.equal((await call("POST", "/api/auth/login", null, { playerId: "ensaio-jogador-01", password: "errada" })).status, 400);
});

// ---------- 2. Campeonato inteiro ----------

test("campeonato inteiro pela API: do primeiro jogo ao campeão, com permissões, cadeado e correções em cada fase", async () => {
  await fresh({ open: false });
  const all = await groupMatches();
  const first = all.find((match) => match.groupId === "A")!;
  const [p1, p2] = playersOf(first.teamAId);
  const [opponent] = playersOf(first.teamBId);

  // Cadeado fechado: jogador 403, administrador 200.
  const locked = await post(first, p1, { setsA: 2, setsB: 0 });
  assert.deepEqual([locked.status, locked.body], [403, { message: RESULTS_LOCKED_MESSAGE, code: "results_locked" }]);
  assert.equal((await post(first, ADMIN, { setsA: 2, setsB: 0 })).status, 200);
  assert.equal((await post(first, p1, { setsA: 2, setsB: 1 })).status, 403, "com o cadeado fechado o jogador também não edita");
  // A única ação do administrador: abrir o cadeado.
  assert.equal((await call("POST", "/api/admin/results-lock", p1, { locked: false })).status, 403);
  assert.deepEqual((await call("POST", "/api/admin/results-lock", ADMIN, { locked: false })).body, { locked: false });

  // Fase de grupos: os dois integrantes lançam/editam, o de fora não, o adversário vê.
  assert.equal((await post(first, p1, { setsA: 2, setsB: 1 })).status, 200);
  assert.equal((await post(first, p2, { setsA: 1, setsB: 2 })).status, 200, "o parceiro edita, inclusive trocando o vencedor");
  assert.equal((await post(first, opponent, scoreFor(first, favourite(first)))).status, 200, "a dupla adversária também lança");
  const outsider = await post(first, outsiderOf(first), { setsA: 0, setsB: 2 });
  assert.deepEqual([outsider.status, outsider.body.message], [403, "Você só pode registrar o resultado de um jogo da sua dupla nesta edição."]);
  assert.equal((await post(first, null, { setsA: 2, setsB: 0 })).status, 401);
  for (const invalid of [{ setsA: 3, setsB: 0 }, { setsA: 1, setsB: 1 }, { setsA: 2, setsB: 2 }, { setsA: "a", setsB: 0 }, {}]) {
    assert.equal((await post(first, p1, invalid as { setsA: unknown; setsB: unknown })).status, 400, JSON.stringify(invalid));
  }
  assert.equal((await post({ id: "nao-existe" }, p1, { setsA: 2, setsB: 0 })).status, 404);
  const seen = (await call<Match[]>("GET", "/api/matches", playersOf(team("B", 5))[0])).body.find((match) => match.id === first.id)!;
  assert.deepEqual(seen.result, scoreFor(first, favourite(first)), "qualquer jogador autenticado vê o placar");

  // 19 jogos: nada de mata-mata. 20º: nasce sozinho.
  const rest = all.filter((match) => match.id !== first.id);
  await playGroupMatches(rest.slice(0, -1));
  assert.deepEqual([(await bracket()).length, (await knockoutMatches()).length, (await status()).groupStage], [0, 0, "em-andamento"]);
  await playGroupMatches(rest.slice(-1));
  await assertKnockoutIntegrity(2);
  await assertStandingsMatchScores();
  assert.deepEqual((await standings("A")).map((row) => row.teamId), [1, 2, 3, 4, 5].map((index) => team("A", index)));
  const statusAfterGroups = await status();
  assert.deepEqual([statusAfterGroups.phase, statusAfterGroups.groupStage, statusAfterGroups.bracketGenerated, statusAfterGroups.editionFinished], ["Mata-mata", "definida", true, false]);
  let r1 = await knockout("Repescagem", 0);
  let r2 = await knockout("Repescagem", 1);
  assert.deepEqual([[r1.teamAId, r1.teamBId], [r2.teamAId, r2.teamBId]], [[team("A", 3), team("B", 4)], [team("B", 3), team("A", 4)]]);
  // GET /api/matches sem filtro inclui o mata-mata; o rótulo de fase é o gravado em match.round.
  const everything = (await call<Match[]>("GET", "/api/matches", p1)).body;
  assert.equal(everything.length, 22);
  assert.deepEqual(everything.filter((match) => match.stage === "mata-mata").map((match) => [match.round, match.order]).sort(), [["Repescagem", 0], ["Repescagem", 1]]);
  // 1º e 2º esperam; o 5º não aparece em lugar nenhum.
  const rows = await bracket(p1);
  assert.ok(!JSON.stringify(rows).includes(team("A", 5)) && !JSON.stringify(rows).includes(team("B", 5)));
  assert.equal((await call("POST", "/api/bracket/generate", p1)).status, 403);
  assert.equal((await call("POST", "/api/bracket/generate", ADMIN)).status, 200, "reconciliar é idempotente");
  await assertKnockoutIntegrity(2);

  // Correção de grupo ANTES do primeiro placar de mata-mata: aceita, chaveamento refeito.
  const a3a4 = all.find((match) => [match.teamAId, match.teamBId].sort().join() === [team("A", 3), team("A", 4)].join())!;
  assert.equal((await post(a3a4, playersOf(team("A", 4))[1], scoreFor(a3a4, team("A", 4)))).status, 200);
  await assertKnockoutIntegrity(2);
  await assertStandingsMatchScores();
  const rebuilt = [await knockout("Repescagem", 0), await knockout("Repescagem", 1)];
  assert.deepEqual(rebuilt.map((match) => [match.teamAId, match.teamBId]), [[team("A", 4), team("B", 4)], [team("B", 3), team("A", 3)]]);
  assert.ok(![r1.id, r2.id].includes(rebuilt[0].id) && ![r1.id, r2.id].includes(rebuilt[1].id), "os jogos antigos do chaveamento foram desfeitos");
  // Volta ao placar original (a3 em 3º), ainda sem placar de mata-mata.
  assert.equal((await post(a3a4, ADMIN, scoreFor(a3a4, team("A", 3)))).status, 200);
  r1 = await knockout("Repescagem", 0);
  r2 = await knockout("Repescagem", 1);
  assert.deepEqual([r1.teamAId, r1.teamBId], [team("A", 3), team("B", 4)]);

  // Repescagem 1: permissões, cadeado, placar inválido, correção com o mesmo vencedor.
  assert.equal((await post(r1, playersOf(team("A", 1))[0], { setsA: 2, setsB: 0 })).status, 403, "quem espera na semifinal não lança a repescagem dos outros");
  assert.equal((await post(r1, playersOf(team("A", 5))[0], { setsA: 2, setsB: 0 })).status, 403, "eliminado não lança");
  assert.equal((await post(r1, playersOf(r1.teamAId)[0], { setsA: 2, setsB: 3 })).status, 400);
  assert.equal((await post(r1, playersOf(r1.teamAId)[0], { setsA: 2, setsB: 0 })).status, 200);
  assert.equal((await post(r1, playersOf(r1.teamAId)[1], { setsA: 2, setsB: 1 })).status, 200, "o parceiro corrige mantendo o vencedor");
  assert.deepEqual((await call<Match[]>("GET", "/api/matches?stage=mata-mata", playersOf(r1.teamBId)[0])).body.find((match) => match.id === r1.id)!.result, { setsA: 2, setsB: 1 });
  await call("POST", "/api/admin/results-lock", ADMIN, { locked: true });
  assert.equal((await post(r1, playersOf(r1.teamBId)[0], { setsA: 2, setsB: 0 })).body.code, "results_locked");
  assert.equal((await post(r1, ADMIN, { setsA: 2, setsB: 0 })).status, 200);
  await call("POST", "/api/admin/results-lock", ADMIN, { locked: false });
  await assertKnockoutIntegrity(2);

  // Correção de grupo DEPOIS do primeiro placar de mata-mata: recusada para todos.
  for (const who of [playersOf(team("A", 4))[0], ADMIN]) {
    const refused = await post(a3a4, who, scoreFor(a3a4, team("A", 4)));
    assert.deepEqual([refused.status, refused.body.code], [409, "result_conflict"]);
    assert.match(refused.body.message!, /mata-mata já tem placar lançado \(Repescagem 1\).*não podem mais ser alterados/);
  }
  assert.deepEqual((await groupMatches()).find((match) => match.id === a3a4.id)!.result, scoreFor(a3a4, team("A", 3)), "o placar de grupo não mudou");

  // Só uma repescagem encerrada: as quartas não existem. Trocar o vencedor agora é livre.
  assert.equal((await knockoutMatches()).length, 2);
  assert.equal((await post(r1, playersOf(r1.teamBId)[0], { setsA: 0, setsB: 2 })).status, 200, "troca de vencedor antes da fase seguinte");
  assert.equal((await post(r1, playersOf(r1.teamAId)[0], { setsA: 2, setsB: 0 })).status, 200);

  // Repescagem 2 → quartas no cruzamento padrão (venceram os dois 3º colocados).
  assert.equal((await post(r2, playersOf(r2.teamAId)[0], { setsA: 2, setsB: 0 })).status, 200);
  await assertKnockoutIntegrity(4);
  let q1 = await knockout("Quartas de final", 0);
  let q2 = await knockout("Quartas de final", 1);
  assert.deepEqual([[q1.teamAId, q1.teamBId], [q2.teamAId, q2.teamBId]], [[team("A", 2), team("B", 3)], [team("B", 2), team("A", 3)]]);
  // Vencedor da Repescagem 2 trocado antes das quartas: quartas desfeitas e refeitas (a4 passa; A3 e A4 são do Grupo A → reencontro inevitável).
  assert.equal((await post(r2, playersOf(r2.teamBId)[1], { setsA: 1, setsB: 2 })).status, 200);
  await assertKnockoutIntegrity(4);
  q1 = await knockout("Quartas de final", 0);
  q2 = await knockout("Quartas de final", 1);
  assert.deepEqual([[q1.teamAId, q1.teamBId], [q2.teamAId, q2.teamBId]], [[team("A", 2), team("A", 4)], [team("B", 2), team("A", 3)]]);
  assert.equal((await post(q1, playersOf(team("B", 3))[0], { setsA: 2, setsB: 0 })).status, 403, "quem perdeu a repescagem depois da correção não lança as quartas");

  // Quartas 1 lançada → o vencedor de QUALQUER repescagem não troca mais.
  assert.equal((await post(q1, playersOf(q1.teamAId)[0], { setsA: 2, setsB: 0 })).status, 200);
  for (const repechage of [r1, r2]) {
    const current = (await knockoutMatches()).find((match) => match.id === repechage.id)!;
    const swapped = { setsA: current.result!.setsB, setsB: current.result!.setsA };
    const refused = await post(repechage, ADMIN, swapped);
    assert.deepEqual([refused.status, refused.body.code], [409, "result_conflict"]);
    assert.match(refused.body.message!, /Não é possível trocar o vencedor: Quartas 1 já foi disputada/);
  }
  assert.equal((await post(r2, playersOf(r2.teamBId)[0], { setsA: 0, setsB: 2 })).status, 200, "mesmo vencedor, outro placar: sempre pode");
  await assertKnockoutIntegrity(5);
  let s2 = await knockout("Semifinal", 1);
  assert.deepEqual([s2.teamAId, s2.teamBId], [team("B", 1), team("A", 2)]);
  assert.equal((await knockoutMatches()).some((match) => match.round === "Semifinal" && match.order === 0), false, "a Semifinal 1 espera as Quartas 2");

  // Vencedor das Quartas 1 trocado antes de a semifinal ter placar: a semifinal troca de dupla.
  assert.equal((await post(q1, playersOf(q1.teamBId)[0], { setsA: 1, setsB: 2 })).status, 200);
  s2 = await knockout("Semifinal", 1);
  assert.deepEqual([s2.teamAId, s2.teamBId], [team("B", 1), team("A", 4)]);
  assert.equal((await post(s2, playersOf(team("A", 2))[0], { setsA: 2, setsB: 0 })).status, 403, "a dupla que deixou de ser vencedora não lança a semifinal");
  assert.equal((await post(q1, playersOf(q1.teamAId)[1], { setsA: 2, setsB: 1 })).status, 200);
  s2 = await knockout("Semifinal", 1);
  assert.deepEqual([s2.teamAId, s2.teamBId], [team("B", 1), team("A", 2)]);

  // Quartas 2 → Semifinal 1. Semifinal 2 lançada → vencedor das Quartas 1 não troca mais.
  await playKnockout("Quartas de final", 1, "B");
  await assertKnockoutIntegrity(6);
  const s1 = await knockout("Semifinal", 0);
  assert.deepEqual([s1.teamAId, s1.teamBId], [team("A", 1), team("A", 3)]);
  assert.equal((await post(s2, playersOf(s2.teamBId)[0], { setsA: 0, setsB: 2 })).status, 200);
  const lateSwap = await post(q1, playersOf(q1.teamBId)[0], { setsA: 0, setsB: 2 });
  assert.deepEqual([lateSwap.status, lateSwap.body.code], [409, "result_conflict"]);
  assert.match(lateSwap.body.message!, /Semifinal 2 já foi disputada/);
  assert.equal((await knockoutMatches()).some((match) => match.round === "Final"), false, "a final espera as duas semifinais");

  // Semifinal 1 → final. Troca de vencedor da semifinal antes da final: a final troca de dupla.
  assert.equal((await post(s1, playersOf(s1.teamAId)[0], { setsA: 2, setsB: 0 })).status, 200);
  await assertKnockoutIntegrity(7);
  let final = await knockout("Final", 0);
  assert.deepEqual([final.teamAId, final.teamBId], [team("A", 1), team("A", 2)]);
  assert.equal((await post(s1, playersOf(s1.teamBId)[0], { setsA: 1, setsB: 2 })).status, 200);
  final = await knockout("Final", 0);
  assert.deepEqual([final.teamAId, final.teamBId], [team("A", 3), team("A", 2)]);
  assert.equal((await post(s1, ADMIN, { setsA: 2, setsB: 1 })).status, 200);
  final = await knockout("Final", 0);
  assert.deepEqual([final.teamAId, final.teamBId], [team("A", 1), team("A", 2)]);
  assert.deepEqual([(await status()).editionFinished, (await editionFiveRows()).length], [false, 0]);

  // Final: campeão automático.
  assert.equal((await post(final, playersOf(team("B", 1))[0], { setsA: 2, setsB: 0 })).status, 403);
  assert.equal((await post(final, playersOf(final.teamBId)[1], { setsA: 1, setsB: 2 })).status, 200);
  await assertKnockoutIntegrity(7);
  let finished = await status();
  assert.deepEqual(
    [finished.phase, finished.editionFinished, finished.champion?.teamId, finished.runnerUp?.teamId, finished.finalResult, finished.syncPending, finished.anomalies],
    ["Campeonato Finalizado", true, team("A", 2), team("A", 1), "2x1", false, []],
  );
  let hall = (await call<HallOfFame>("GET", "/api/history", null)).body;
  assert.deepEqual(hall.editions.map((entry) => entry.edition), [1, 2, 3, 4, 5], "exatamente uma linha por edição");
  assert.deepEqual([hall.editions[4].champions, hall.editions[4].runnersUp, hall.editions[4].finalResult, hall.currentEdition], [["Jogador 3", "Jogador 4"], ["Jogador 1", "Jogador 2"], "2x1", 5]);
  let major = (await call<MajorChampionEntry[]>("GET", "/api/history/major-champions", p1)).body;
  assert.deepEqual(major.filter((entry) => entry.titles > 0).map((entry) => [entry.name, entry.titles, entry.editions]), [
    ["Jogador 1 & Jogador 2", 2, [1, 2]], ["Jogador 11 & Jogador 12", 1, [4]], ["Jogador 21 & Jogador 22", 1, [3]], ["Jogador 3 & Jogador 4", 1, [5]],
  ]);
  const dashboard = (await call("GET", "/api/dashboard", ADMIN)).body;
  assert.deepEqual([dashboard.currentPhase, dashboard.champion], ["Campeonato Finalizado", { teamId: team("A", 2), teamName: "Jogador 3 & Jogador 4" }]);

  // Depois do encerramento: jogador não lança nem edita nada; o administrador ainda corrige.
  for (const [match, player] of [[final, playersOf(final.teamBId)[0]], [first, p1], [s1, playersOf(s1.teamAId)[0]]] as Array<[Match, string]>) {
    const refused = await post(match, player, { setsA: 2, setsB: 0 });
    assert.deepEqual([refused.status, refused.body], [403, { message: EDITION_FINISHED_MESSAGE, code: "edition_finished" }]);
  }
  assert.equal((await post(final, ADMIN, { setsA: 0, setsB: 2 })).status, 200, "mesmo vencedor, placar corrigido");
  assert.equal((await editionFiveRows())[0].finalResult, "2x0");
  assert.equal((await post(final, ADMIN, { setsA: 2, setsB: 1 })).status, 200, "o administrador troca o vencedor da final");
  hall = (await call<HallOfFame>("GET", "/api/history", null)).body;
  assert.deepEqual(hall.editions.map((entry) => entry.edition), [1, 2, 3, 4, 5], "continua uma linha só");
  assert.deepEqual([hall.editions[4].champions, hall.editions[4].runnersUp, hall.editions[4].finalResult], [["Jogador 1", "Jogador 2"], ["Jogador 3", "Jogador 4"], "2x1"]);
  major = (await call<MajorChampionEntry[]>("GET", "/api/history/major-champions", p1)).body;
  assert.deepEqual(major.filter((entry) => entry.titles > 0).map((entry) => [entry.name, entry.titles, entry.editions]), [
    ["Jogador 1 & Jogador 2", 3, [1, 2, 5]], ["Jogador 11 & Jogador 12", 1, [4]], ["Jogador 21 & Jogador 22", 1, [3]],
  ]);
  finished = await status();
  assert.deepEqual([finished.editionFinished, finished.champion?.teamId], [true, team("A", 1)]);
  assert.equal((await post(s1, ADMIN, { setsA: 0, setsB: 2 })).status, 409, "nem o administrador troca o vencedor da semifinal com a final disputada");
  assert.equal((await post(a3a4, ADMIN, scoreFor(a3a4, team("A", 4)))).status, 409);
  await assertKnockoutIntegrity(7);

  // O que o navegador lê direto do Supabase (emulado no ensaio) mostra o mesmo campeão.
  const rest5 = (await (await realFetch(base + "/rest/v1/truco_history")).json() as Array<{ edition: number; champion: { truco_team_members: Array<{ truco_players: { name: string } }> } }>).find((row) => row.edition === 5)!;
  assert.deepEqual(rest5.champion.truco_team_members.map((member) => member.truco_players.name), ["Jogador 1", "Jogador 2"]);
  const audit = (await call("GET", "/api/matches/audit", ADMIN)).body as Array<{ action: string }>;
  assert.ok(audit.some((row) => row.action === "result_created") && audit.some((row) => row.action === "result_updated"));
});

// ---------- 3. Fase de grupos sem ordem obrigatória ----------

test("o jogo de maior ordem pode ser lançado antes do de menor, e um placar pode ser editado várias vezes", async () => {
  await fresh();
  const matches = (await groupMatches()).filter((match) => match.groupId === "A").sort((a, b) => b.order - a.order);
  const last = matches[0];
  const lowest = matches.at(-1)!;
  assert.ok(last.order > lowest.order && (last.queuePosition ?? 0) !== (lowest.queuePosition ?? 0));
  assert.equal((await post(last, playersOf(last.teamBId)[1], { setsA: 2, setsB: 0 })).status, 200, "nenhuma dependência de rodada, mesa, bloco ou fila");
  assert.equal((await groupMatches()).find((match) => match.id === lowest.id)!.status, "pendente");
  await assertStandingsMatchScores();

  // Mesma partida editada cinco vezes, alternando jogadores e trocando o vencedor.
  const editors = [...playersOf(last.teamAId), ...playersOf(last.teamBId)];
  for (const [index, score] of [{ setsA: 2, setsB: 1 }, { setsA: 1, setsB: 2 }, { setsA: 0, setsB: 2 }, { setsA: 2, setsB: 0 }, { setsA: 1, setsB: 2 }].entries()) {
    const reply = await post(last, editors[index % 4], score);
    assert.deepEqual([reply.status, reply.body.result], [200, score]);
    await assertStandingsMatchScores();
    const rows = await standings("A");
    const winner = score.setsA > score.setsB ? last.teamAId : last.teamBId;
    assert.equal(rows[0].teamId, winner, "com um jogo só, quem venceu lidera");
    assert.deepEqual([rows[0].pontos, rows.find((row) => row.teamId !== winner && row.jogos === 1)!.pontos], Math.min(score.setsA, score.setsB) === 0 ? [3, 0] : [2, 1]);
  }
  assert.equal((await groupMatches()).filter((match) => match.status === "realizado").length, 1, "editar não cria jogo nem mexe nos outros");
});

for (const seed of [7, 2026, 90210]) {
  test(`os 20 resultados em ordem aleatória (semente ${seed}), alternando jogadores e grupos: mata-mata ausente até o 19º e presente no 20º`, async () => {
    await fresh();
    const random = createSeededRandom(seed);
    const shuffled = await groupMatches();
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    const scores = [{ setsA: 2, setsB: 0 }, { setsA: 2, setsB: 1 }, { setsA: 1, setsB: 2 }, { setsA: 0, setsB: 2 }];
    for (const [index, match] of shuffled.entries()) {
      const participants = [...playersOf(match.teamAId), ...playersOf(match.teamBId)];
      const score = scores[Math.floor(random() * 4)];
      assert.equal((await post(match, participants[Math.floor(random() * 4)], score)).status, 200);
      // Uma em cada três vezes o placar é corrigido em seguida por outro jogador.
      if (random() < 0.34) assert.equal((await post(match, participants[Math.floor(random() * 4)], scores[Math.floor(random() * 4)])).status, 200);
      await assertStandingsMatchScores();
      if (index < shuffled.length - 1) {
        assert.deepEqual([(await bracket()).length, (await knockoutMatches()).length], [0, 0], `com ${index + 1} jogos não existe mata-mata`);
      }
    }
    assert.ok(new Set(shuffled.slice(0, 6).map((match) => match.groupId)).size === 2, "a ordem embaralhada mistura os dois grupos");

    // Com os 20: ou a classificação está definida e o mata-mata existe, ou há empate absoluto e ele espera o administrador.
    let current = await status();
    let guard = 0;
    while (current.groupStage === "empate-pendente") {
      assert.deepEqual([(await bracket()).length, (await knockoutMatches()).length], [0, 0], "empate absoluto: nada é gerado nem sorteado");
      const group = current.pendingTieGroups[0];
      const pending = (await standings(group)).filter((row) => row.tiePending);
      const sameTie = (row: StandingRow) => [row.pontos, row.vitorias, row.vitorias2x0, row.confrontoDireto, row.saldoSets].join();
      const cluster = pending.filter((row) => sameTie(row) === sameTie(pending[0]));
      assert.equal((await call("POST", `/api/groups/${group}/tiebreak`, ADMIN, { orderedTeamIds: cluster.map((row) => row.teamId).reverse() })).status, 201);
      current = await status();
      assert.ok((guard += 1) < 6);
    }
    assert.equal(current.groupStage, "definida");
    await assertKnockoutIntegrity(2);
    const [a, b] = [await standings("A"), await standings("B")];
    const at = (rows: StandingRow[], position: number) => rows.find((row) => row.position === position)!.teamId;
    const [r1, r2] = [await knockout("Repescagem", 0), await knockout("Repescagem", 1)];
    assert.deepEqual([[r1.teamAId, r1.teamBId], [r2.teamAId, r2.teamBId]], [[at(a, 3), at(b, 4)], [at(b, 3), at(a, 4)]]);
  });
}

// ---------- 4. Empate absoluto ----------

/** a1 vence a2, a2 vence a3, a3 vence a1; os três vencem a4 e a5; tudo 2x0: empate absoluto pelo 1º, 2º e 3º lugares. */
const triangle = (group: GroupId) => (match: Match) => {
  if (match.groupId !== group) return favourite(match);
  const pair = [seedOf(match.teamAId), seedOf(match.teamBId)].sort().join("");
  return pair === "13" ? team(group, 3) : favourite(match);
};

test("empate absoluto: o mata-mata não é gerado nem sorteado; a decisão do administrador gera na mesma chamada", async () => {
  await fresh();
  await playGroupMatches(await groupMatches(), triangle("A"));
  const pending = await status();
  assert.deepEqual([pending.groupStage, pending.pendingTieGroups, pending.bracketGenerated, pending.phase], ["empate-pendente", ["A"], false, "Fase de Grupos"]);
  assert.deepEqual([(await bracket()).length, (await knockoutMatches()).length], [0, 0]);
  const rows = await standings("A");
  assert.deepEqual(rows.map((row) => row.tiePending), [true, true, true, false, false]);
  const generate = await call("POST", "/api/bracket/generate", ADMIN);
  assert.equal(generate.status, 409);
  assert.match(generate.body.message, /empate sem critério de desempate no Grupo A/);

  const decision = { orderedTeamIds: [team("A", 2), team("A", 3), team("A", 1)] };
  assert.equal((await call("POST", "/api/groups/A/tiebreak", playersOf(team("A", 1))[0], decision)).status, 403, "só o administrador decide");
  assert.equal((await call("POST", "/api/groups/A/tiebreak", ADMIN, { orderedTeamIds: [team("A", 2), team("A", 3)] })).status, 409, "a decisão precisa cobrir o empate inteiro");
  assert.equal((await bracket()).length, 0);
  const decided = await call<StandingRow[]>("POST", "/api/groups/A/tiebreak", ADMIN, decision);
  assert.equal(decided.status, 201);
  assert.deepEqual(decided.body.map((row) => row.teamId), [team("A", 2), team("A", 3), team("A", 1), team("A", 4), team("A", 5)]);
  await assertKnockoutIntegrity(2);
  const r1 = await knockout("Repescagem", 0);
  assert.deepEqual([r1.teamAId, r1.teamBId], [team("A", 1), team("B", 4)]);
  assert.equal((await call("POST", "/api/groups/A/tiebreak", ADMIN, decision)).status, 409, "com o mata-mata gerado não há mais empate a decidir");

  // Uma correção de grupo que reabre um empate absoluto (no Grupo B) faz o mata-mata sumir de novo.
  const b1b3 = (await groupMatches()).find((match) => [match.teamAId, match.teamBId].sort().join() === [team("B", 1), team("B", 3)].join())!;
  assert.equal((await post(b1b3, playersOf(team("B", 3))[0], scoreFor(b1b3, team("B", 3)))).status, 200);
  const reopened = await status();
  assert.deepEqual([reopened.groupStage, reopened.pendingTieGroups, reopened.bracketGenerated, reopened.phase], ["empate-pendente", ["B"], false, "Fase de Grupos"]);
  assert.deepEqual([(await bracket()).length, (await knockoutMatches()).length], [0, 0]);
  // Desfeita a correção, o mata-mata volta sozinho (a decisão do Grupo A continua valendo).
  assert.equal((await post(b1b3, playersOf(team("B", 1))[0], scoreFor(b1b3, team("B", 1)))).status, 200);
  await assertKnockoutIntegrity(2);
});

// ---------- 5. Concorrência ----------

const both = async (...requests: Array<Promise<Reply>>) => {
  const replies = await Promise.all(requests);
  for (const reply of replies) assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return replies;
};

for (const enforceUniqueness of [true, false]) {
  test(`lançamentos simultâneos em todas as fases, ${enforceUniqueness ? "com" : "sem"} as restrições de unicidade do banco: nunca duplica`, async () => {
    for (let round = 0; round < 4; round += 1) {
      await fresh();
      const store = rehearsalStore();
      store.enforceUniqueness = enforceUniqueness;
      const all = await groupMatches();
      const lastTwo = [all.filter((match) => match.groupId === "A").at(-1)!, all.filter((match) => match.groupId === (round % 2 ? "A" : "B")).at(round % 2 ? -2 : -1)!];
      await playGroupMatches(all.filter((match) => !lastTwo.includes(match)).slice(1));
      const early = all.filter((match) => !lastTwo.includes(match))[0];
      store.latencyMs = 2;

      // O mesmo jogo pelos dois parceiros, e pela dupla adversária, ao mesmo tempo.
      await both(
        post(early, playersOf(early.teamAId)[0], scoreFor(early, favourite(early))),
        post(early, playersOf(early.teamAId)[1], scoreFor(early, favourite(early), 1)),
        post(early, playersOf(early.teamBId)[0], scoreFor(early, favourite(early))),
      );
      assert.deepEqual([(await bracket()).length, (await knockoutMatches()).length], [0, 0]);

      // Os dois últimos jogos de grupo juntos.
      await both(...lastTwo.map((match, index) => post(match, playersOf(match.teamAId)[index], scoreFor(match, favourite(match)))));
      await assertKnockoutIntegrity(2);

      // As duas repescagens juntas, cada uma lançada pelas duas duplas ao mesmo tempo.
      const [r1, r2] = [await knockout("Repescagem", 0), await knockout("Repescagem", 1)];
      await both(
        post(r1, playersOf(r1.teamAId)[0], { setsA: 2, setsB: 0 }), post(r1, playersOf(r1.teamBId)[0], { setsA: 2, setsB: 1 }),
        post(r2, playersOf(r2.teamAId)[1], { setsA: 0, setsB: 2 }), post(r2, playersOf(r2.teamBId)[1], { setsA: 1, setsB: 2 }),
      );
      await assertKnockoutIntegrity(4);

      // As duas quartas juntas.
      const [q1, q2] = [await knockout("Quartas de final", 0), await knockout("Quartas de final", 1)];
      await both(
        post(q1, playersOf(q1.teamAId)[0], { setsA: 2, setsB: 0 }), post(q1, playersOf(q1.teamAId)[1], { setsA: 2, setsB: 1 }),
        post(q2, playersOf(q2.teamBId)[0], { setsA: 2, setsB: 0 }), post(q2, playersOf(q2.teamAId)[0], { setsA: 2, setsB: 0 }),
      );
      await assertKnockoutIntegrity(6);

      // As duas semifinais juntas.
      const [s1, s2] = [await knockout("Semifinal", 0), await knockout("Semifinal", 1)];
      await both(
        post(s1, playersOf(s1.teamAId)[0], { setsA: 2, setsB: 0 }), post(s1, playersOf(s1.teamBId)[0], { setsA: 2, setsB: 1 }),
        post(s2, playersOf(s2.teamAId)[0], { setsA: 2, setsB: 1 }), post(s2, playersOf(s2.teamBId)[1], { setsA: 2, setsB: 0 }),
      );
      await assertKnockoutIntegrity(7);
      assert.equal((await editionFiveRows()).length, 0);

      // A final pelos quatro jogadores ao mesmo tempo: quem chega depois do encerramento leva 403.
      const final = await knockout("Final", 0);
      const replies = await Promise.all([...playersOf(final.teamAId), ...playersOf(final.teamBId)].map((player) => post(final, player, { setsA: 2, setsB: 0 })));
      assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 403, 403, 403], "o primeiro encerra a edição; os outros três já a encontram encerrada");
      assert.ok(replies.filter((reply) => reply.status === 403).every((reply) => reply.body.code === "edition_finished"));
      // O administrador corrige a final duas vezes ao mesmo tempo, trocando o vencedor.
      await both(post(final, ADMIN, { setsA: 0, setsB: 2 }), post(final, ADMIN, { setsA: 1, setsB: 2 }));
      store.latencyMs = 0;
      await assertKnockoutIntegrity(7);
      const rows = await editionFiveRows();
      assert.equal(rows.length, 1, "o histórico tem exatamente uma linha da edição");
      assert.equal((await call<HallOfFame>("GET", "/api/history", null)).body.editions.length, 5);
      const finished = await status();
      assert.deepEqual([finished.editionFinished, finished.champion?.teamId, finished.syncPending], [true, final.teamBId, false]);
    }
  });
}

test("modelo em memória de chamadas sem fila: unicidade simulada e sincronização convergem (não valida o banco)", async () => {
  let conflictsAbsorbed = 0;
  for (let round = 0; round < 12; round += 1) {
    await fresh();
    const store = rehearsalStore();
    const all = await groupMatches();
    const lastTwo = [all.filter((match) => match.groupId === "A").at(-1)!, all.filter((match) => match.groupId === "B").at(-1)!];
    await playGroupMatches(all.filter((match) => !lastTwo.includes(match)));
    store.latencyMs = 3;
    const actor = { id: "ensaio-conta-admin", role: "superadmin" as const };
    // Cada chamada "sem fila" faz o papel de uma instância diferente recebendo o lançamento.
    const outcomes = await Promise.allSettled(lastTwo.flatMap((match) => [0, 1].map(() => recordResultUnlocked(CHAMPIONSHIP, match.id, scoreFor(match, favourite(match)), actor))));
    conflictsAbsorbed += outcomes.filter((outcome) => outcome.status === "rejected").length;
    await syncKnockout(CHAMPIONSHIP);
    await assertKnockoutIntegrity(2);

    const [r1, r2] = [await knockout("Repescagem", 0), await knockout("Repescagem", 1)];
    await Promise.allSettled([r1, r1, r2, r2].map((match) => recordResultUnlocked(CHAMPIONSHIP, match.id, { setsA: 2, setsB: 0 }, actor)));
    await syncKnockout(CHAMPIONSHIP);
    store.latencyMs = 0;
    await assertKnockoutIntegrity(4);
  }
  assert.ok(Number.isInteger(conflictsAbsorbed));
});

// ---------- 6. Falha no meio ----------

async function untilLastGroupMatch(): Promise<Match> {
  await fresh();
  const all = await groupMatches();
  await playGroupMatches(all.slice(0, -1));
  return all.at(-1)!;
}
const lastPost = (match: Match) => post(match, playersOf(match.teamAId)[0], scoreFor(match, favourite(match)));

test("falha passageira no avanço (jogo criado, vínculo não gravado): a própria chamada tenta de novo e repara, sem duplicar", async () => {
  const last = await untilLastGroupMatch();
  rehearsalStore().failNext("linkBracketMatch", 1);
  assert.equal((await lastPost(last)).status, 200);
  await assertKnockoutIntegrity(2);
});

test("falha repetida na geração: placar salvo, GET sem escrita e worker conclui", async () => {
  const last = await untilLastGroupMatch();
  rehearsalStore().failNext("createBracketMatches", 2);
  const reply = await lastPost(last);
  assert.deepEqual([reply.status, reply.body.code], [503, "progression_pending"]);
  assert.match(reply.body.message!, /placar foi gravado/);
  assert.equal((await groupMatches()).filter((match) => match.status === "realizado").length, 20, "os 20 placares estão gravados");
  // É também o caso de uma edição que já tinha os 20 placares antes de a geração automática existir.
  const pending = await status();
  assert.deepEqual([pending.bracketGenerated, pending.syncPending, pending.groupStage], [false, true, "definida"]);
  assert.equal((await bracket(playersOf(team("B", 5))[1])).length, 0, "GET não altera o campeonato");
  await recoverPendingKnockout();
  assert.equal((await bracket()).length, 7);
  await assertKnockoutIntegrity(2);
});

test("falha repetida entre criar o jogo e vincular: o jogo solto é adotado depois, nunca criado de novo", async () => {
  const last = await untilLastGroupMatch();
  rehearsalStore().failNext("linkBracketMatch", 2);
  assert.equal((await lastPost(last)).status, 503);
  const loose = await knockoutMatches();
  assert.equal(loose.length, 1, "um jogo de repescagem foi criado, mas ficou sem vínculo");
  // Lançar o mesmo placar de novo (como a mensagem orienta) também conclui.
  assert.equal((await lastPost(last)).status, 200);
  await assertKnockoutIntegrity(2);
  assert.ok((await knockoutMatches()).some((match) => match.id === loose[0].id), "o jogo criado antes da falha foi aproveitado");
});

test("falha no meio de desfazer o chaveamento (correção de grupo): termina limpo na chamada seguinte", async () => {
  await fresh();
  await finishGroupStage();
  const a3a4 = (await groupMatches()).find((match) => [match.teamAId, match.teamBId].sort().join() === [team("A", 3), team("A", 4)].join())!;
  // O chaveamento é apagado, mas a remoção dos jogos pendentes falha: sobram dois jogos soltos.
  // A segunda tentativa da própria chamada recria o chaveamento, adota os jogos e acerta as duplas.
  const oldIds = (await knockoutMatches()).map((match) => match.id).sort();
  rehearsalStore().failNext("clearKnockout:matches", 1);
  assert.equal((await post(a3a4, ADMIN, scoreFor(a3a4, team("A", 4)))).status, 200);
  await assertKnockoutIntegrity(2);
  assert.deepEqual((await knockoutMatches()).map((match) => match.id).sort(), oldIds, "os jogos soltos foram reaproveitados, não duplicados");
  const r1 = await knockout("Repescagem", 0);
  assert.deepEqual([r1.teamAId, r1.teamBId], [team("A", 4), team("B", 4)], "o chaveamento refeito usa a classificação corrigida");
});

test("falha ao trocar a dupla do jogo seguinte e ao registrar o campeão: a rodada seguinte conserta", async () => {
  await fresh();
  await finishGroupStage();
  await playKnockout("Repescagem", 0);
  await playKnockout("Repescagem", 1);
  const q1 = await playKnockout("Quartas de final", 0);
  const before = await knockout("Semifinal", 1);
  assert.equal(before.teamBId, q1.teamAId);
  // Vencedor das Quartas 1 trocado, mas a troca da dupla na semifinal falha três vezes seguidas.
  rehearsalStore().failNext("setMatchTeam", 3);
  assert.equal((await post(q1, ADMIN, scoreFor(q1, q1.teamBId))).status, 503);
  assert.equal((await knockout("Semifinal", 1)).teamBId, q1.teamAId, "a semifinal ficou com a dupla antiga");
  await recoverPendingKnockout();
  assert.equal((await knockout("Semifinal", 1)).teamBId, q1.teamBId, "a consulta seguinte trocou a dupla");

  await playKnockout("Quartas de final", 1);
  await playKnockout("Semifinal", 0);
  await playKnockout("Semifinal", 1);
  const final = await knockout("Final", 0);
  rehearsalStore().failNext("saveEditionChampion", 2);
  assert.equal((await post(final, playersOf(final.teamAId)[0], { setsA: 2, setsB: 1 })).status, 503);
  let current = await status();
  assert.deepEqual([current.editionFinished, current.syncPending, (await editionFiveRows()).length], [false, true, 0], "sem campeão gravado a edição não é dada como encerrada");
  await recoverPendingKnockout();
  current = await status();
  assert.deepEqual([current.editionFinished, current.champion?.teamId, current.finalResult, (await editionFiveRows()).length], [true, final.teamAId, "2x1", 1]);
  await assertKnockoutIntegrity(7);
});

// ---------- 7. Sessão do frontend ----------

test("o token do ensaio é aceito pelo supabase-js (setSession, renovação) e o Hall da Fama é lido como no navegador", async () => {
  await fresh();
  const session = sessions.get("ensaio-jogador-07")!;
  const client = createClient(base, "chave-publica-de-ensaio", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: realFetch } });
  const restored = await client.auth.setSession({ access_token: session.token, refresh_token: session.refreshToken });
  assert.equal(restored.error, null);
  assert.equal(restored.data.session?.user.id, session.userId);
  assert.equal((await client.auth.getSession()).data.session?.access_token, session.token);

  const renewed = await client.auth.refreshSession();
  assert.equal(renewed.error, null);
  const renewedToken = renewed.data.session!.access_token;
  assert.equal((await realFetch(base + "/api/teams", { headers: { Authorization: "Bearer " + renewedToken } })).status, 200, "o token renovado vale na API");

  const hall = await client.from("truco_history")
    .select(`truco_id, edition, name, year, final_result, notes,
       champion:truco_teams!truco_history_champion_team_id_fkey(name, truco_team_members(position, truco_players(name))),
       runner_up:truco_teams!truco_history_runner_up_team_id_fkey(name, truco_team_members(position, truco_players(name)))`)
    .order("edition", { ascending: true });
  assert.equal(hall.error, null);
  assert.deepEqual((hall.data as unknown as Array<{ edition: number }>).map((row) => row.edition), [1, 2, 3, 4]);
  const current = await client.from("truco_championships").select("edition, year").eq("status", "em_andamento").maybeSingle();
  assert.deepEqual([current.error, current.data], [null, { edition: 5, year: 2026 }]);
  assert.equal((await client.auth.signOut()).error, null);
});

test("nenhuma chamada saiu para fora do processo durante o ensaio", () => {
  assert.deepEqual(outsideCalls, []);
});

for (const change of ["lock", "profile", "participants", "match", "edition"] as const) {
  test(`permissão revalidada ao sair da fila: ${change}`, async () => {
    await fresh();
    const store = rehearsalStore();
    const match = (await groupMatches())[0];
    const playerId = playersOf(match.teamAId)[0];
    const account = store.findAccount({ playerId })!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const blocker = withChampionshipLock(CHAMPIONSHIP, () => gate);
    // A chamada usa o papel antigo; o serviço tem de consultar o perfil atual.
    const pending = recordResult(CHAMPIONSHIP, match.id, { setsA: 2, setsB: 0 }, { id: account.id, role: "superadmin" });
    const rejected = assert.rejects(pending, ResultPermissionError);
    if (change === "lock") await store.setResultsLocked(CHAMPIONSHIP, true);
    if (change === "profile") account.mustChangePassword = true;
    if (change === "participants") account.playerId = outsiderOf(match);
    if (change === "match") {
      const outsider = teams.find((team) => team.id !== match.teamAId && team.id !== match.teamBId)!;
      await store.setMatchTeam(match.id, "A", outsider.id);
    }
    const original = store.getCurrentChampionship.bind(store);
    if (change === "edition") store.getCurrentChampionship = async () => ({ ...await original(), truco_id: "outra-edicao" });
    release();
    try { await blocker; await rejected; } finally { store.getCurrentChampionship = original; }
    assert.equal((await store.getMatch(match.id))!.result, null);
    assert.equal((await store.listMatchResultAudit(CHAMPIONSHIP)).length, 0);
  });
}

test("refresh de Mata-mata e status nunca altera confrontos, placares ou histórico", async () => {
  await fresh();
  await finishGroupStage();
  await playKnockout("Repescagem", 0);
  const store = rehearsalStore();
  const before = [await store.listBracketMatches(CHAMPIONSHIP), await store.listMatches(CHAMPIONSHIP), await store.listHistory()];
  for (let index = 0; index < 4; index += 1) { await bracket(); await status(); }
  assert.deepEqual([await store.listBracketMatches(CHAMPIONSHIP), await store.listMatches(CHAMPIONSHIP), await store.listHistory()], before);
});

test("erro permanente no avanço não ganha retries nem loop no worker; placar permanece salvo", async () => {
  const last = await untilLastGroupMatch();
  const store = rehearsalStore();
  const original = store.createBracketMatches.bind(store);
  let calls = 0;
  store.createBracketMatches = async () => { calls += 1; throw new StoreOperationError("Coluna ausente", "42703"); };
  try {
    const reply = await lastPost(last);
    assert.deepEqual([reply.status, reply.body.code, (reply.body as any).resultSaved, (reply.body as any).retryable], [503, "progression_pending", true, false]);
    assert.equal(calls, 1);
    await recoverPendingKnockout().catch(() => undefined);
    assert.equal(calls, 2);
    await recoverPendingKnockout();
    assert.equal(calls, 2, "worker não insiste no mesmo estado com erro permanente");
    assert.ok((await store.getMatch(last.id))!.result);
  } finally { store.createBracketMatches = original; }
});

test("correção da final salva com histórico ainda antigo não confirma o campeão até o worker concluir", async () => {
  await fresh();
  await finishGroupStage();
  for (const round of ["Repescagem", "Quartas de final", "Semifinal"]) {
    await playKnockout(round, 0); await playKnockout(round, 1);
  }
  const final = await playKnockout("Final", 0);
  rehearsalStore().failNext("saveEditionChampion", 2);
  const reply = await post(final, ADMIN, scoreFor(final, final.teamBId));
  assert.equal(reply.status, 503);
  const pending = await status();
  assert.deepEqual([pending.editionFinished, pending.champion, pending.syncPending], [false, null, true]);
  await recoverPendingKnockout();
  const repaired = await status();
  assert.deepEqual([repaired.editionFinished, repaired.champion?.teamId, repaired.syncPending], [true, final.teamBId, false]);
  assert.equal((await editionFiveRows()).length, 1);
});

test("novo jogo do mata-mata não recebe placar enquanto o avanço anterior está pendente", async () => {
  await fresh();
  await finishGroupStage();
  const match = await knockout("Repescagem", 0);
  const store = rehearsalStore();
  const original = store.getCurrentChampionship.bind(store);
  store.getCurrentChampionship = async () => ({ ...await original(), progression_pending: true });
  try {
    const reply = await post(match, playersOf(match.teamAId)[0], { setsA: 2, setsB: 0 });
    assert.equal(reply.status, 409);
    assert.match(reply.body.message!, /avanço anterior/);
    assert.equal((await store.getMatch(match.id))!.result, null);
  } finally { store.getCurrentChampionship = original; }
});
