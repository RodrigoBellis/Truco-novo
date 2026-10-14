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

// Formato de 14/10/2026: grupo único com 7 duplas fictícias, ensaio-dupla-a1 ... a7.
const team = (_group: GroupId, index: number) => `ensaio-dupla-a${index}`;
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
const standings = async () => (await call<StandingRow[]>("GET", "/api/groups/A/standings", ADMIN)).body;

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

const QUARTAS = "Quartas de final";
const SEMI = "Semifinal";
const TERCEIRO = "Disputa de 3º lugar";
const FINAL = "Final";

const key = (item: { round: string; order: number }) => `${item.round}#${item.order}`;
async function knockout(roundLabel: string, order: number): Promise<Match> {
  const match = (await knockoutMatches()).find((item) => item.round === roundLabel && item.order === order);
  assert.ok(match, `jogo ${roundLabel} ${order + 1} deveria existir`);
  return match;
}
const hasKnockout = async (roundLabel: string, order = 0) => (await knockoutMatches()).some((item) => item.round === roundLabel && item.order === order);

/** Invariantes do mata-mata: seis confrontos distintos, no máximo um jogo por confronto, nada solto. */
async function assertKnockoutIntegrity(expectedMatches: number): Promise<void> {
  const rows = await bracket();
  const games = await knockoutMatches();
  assert.equal(rows.length, 6, "o chaveamento tem exatamente 6 confrontos");
  assert.equal(new Set(rows.map(key)).size, 6, "nenhum confronto duplicado");
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
  const rows = await standings();
  const expected = independentTable(rows.map((row) => row.teamId), matches);
  for (const row of rows) {
    const { jogos, vitorias, vitorias2x0, derrotas, pontos, saldoSets } = row;
    assert.deepEqual({ jogos, vitorias, vitorias2x0, derrotas, pontos, saldoSets }, expected[row.teamId], row.teamId);
  }
  assert.deepEqual(rows.map((row) => row.position), [1, 2, 3, 4, 5, 6, 7]);
  for (let index = 1; index < rows.length; index += 1) {
    const [above, below] = [rows[index - 1], rows[index]];
    const order = above.pontos - below.pontos || above.vitorias - below.vitorias || above.vitorias2x0 - below.vitorias2x0 || above.confrontoDireto - below.confrontoDireto || above.saldoSets - below.saldoSets;
    assert.ok(order >= 0, `${above.teamId} não pode estar acima de ${below.teamId}`);
  }
}

/** Fase de grupos inteira com os favoritos vencendo: 1º a1 ... 7º a7, quartas geradas. */
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

test("ensaio: semente isolada com 7 duplas, 14 jogadores, 1 admin, cadeado fechado e os 21 confrontos distintos do grupo único", async () => {
  await fresh({ open: false });
  assert.deepEqual((await call("GET", "/api/health", null)).body, { status: "ok", rehearsal: true });
  assert.equal(teams.length, 7);
  assert.ok(teams.every((item) => item.groupId === "A" && item.status === "aprovada"));
  assert.equal(new Set(teams.flatMap((item) => [item.player1Id, item.player2Id])).size, 14);
  assert.equal((await call("GET", "/api/players/roster", null)).body.length, 14, "só os 14 participantes aparecem no login");
  assert.deepEqual((await call("GET", "/api/matches/lock", playersOf(team("A", 1))[0])).body, { locked: true });
  const groups = (await call<Array<{ id: string; name: string; teamIds: string[] }>>("GET", "/api/groups", ADMIN)).body;
  assert.deepEqual(groups.map((group) => [group.id, group.name, group.teamIds.length]), [["A", "Grupo Único", 7]]);

  const matches = await groupMatches();
  assert.equal(matches.length, 21);
  const pairs = matches.map((match) => [match.teamAId, match.teamBId].sort().join(" x "));
  assert.equal(new Set(pairs).size, 21, "todo par uma única vez");
  for (const item of teams) {
    assert.equal(matches.filter((match) => match.teamAId === item.id || match.teamBId === item.id).length, 6, "cada dupla joga contra as outras seis");
  }
  assert.ok(matches.every((match) => match.groupId === "A" && match.teamAId !== match.teamBId && match.result === null && match.status === "pendente"));
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

test("campeonato inteiro pela API: 27 partidas, do primeiro jogo ao campeão e ao 3º lugar, com permissões, cadeado e correções", async () => {
  await fresh({ open: false });
  const all = await groupMatches();
  const first = all[0];
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
  const seen = (await call<Match[]>("GET", "/api/matches", playersOf(team("A", 7))[0])).body.find((match) => match.id === first.id)!;
  assert.deepEqual(seen.result, scoreFor(first, favourite(first)), "qualquer jogador autenticado vê o placar");

  // 20 jogos: nada de mata-mata. 21º: nasce sozinho.
  const rest = all.filter((match) => match.id !== first.id);
  await playGroupMatches(rest.slice(0, -1));
  assert.deepEqual([(await bracket()).length, (await knockoutMatches()).length, (await status()).groupStage], [0, 0, "em-andamento"]);
  await playGroupMatches(rest.slice(-1));
  await assertKnockoutIntegrity(2);
  await assertStandingsMatchScores();
  assert.deepEqual((await standings()).map((row) => row.teamId), [1, 2, 3, 4, 5, 6, 7].map((index) => team("A", index)));
  const statusAfterGroups = await status();
  assert.deepEqual([statusAfterGroups.phase, statusAfterGroups.groupStage, statusAfterGroups.bracketGenerated, statusAfterGroups.editionFinished], ["Mata-mata", "definida", true, false]);
  let q1 = await knockout(QUARTAS, 0);
  let q2 = await knockout(QUARTAS, 1);
  assert.deepEqual([[q1.teamAId, q1.teamBId], [q2.teamAId, q2.teamBId]], [[team("A", 3), team("A", 6)], [team("A", 4), team("A", 5)]]);
  // GET /api/matches sem filtro inclui o mata-mata; o rótulo de fase é o gravado em match.round.
  const everything = (await call<Match[]>("GET", "/api/matches", p1)).body;
  assert.equal(everything.length, 23);
  assert.deepEqual(everything.filter((match) => match.stage === "mata-mata").map((match) => [match.round, match.order]).sort(), [[QUARTAS, 0], [QUARTAS, 1]]);
  // 1º e 2º esperam na semifinal; o 7º não aparece em lugar nenhum.
  const rows = await bracket(p1);
  assert.ok(!JSON.stringify(rows).includes(team("A", 7)));
  assert.equal((await call("POST", "/api/bracket/generate", p1)).status, 403);
  assert.equal((await call("POST", "/api/bracket/generate", ADMIN)).status, 200, "reconciliar é idempotente");
  await assertKnockoutIntegrity(2);

  // Correção de grupo ANTES do primeiro placar de mata-mata: aceita, chaveamento refeito.
  const a3a4 = all.find((match) => [match.teamAId, match.teamBId].sort().join() === [team("A", 3), team("A", 4)].join())!;
  assert.equal((await post(a3a4, playersOf(team("A", 4))[1], scoreFor(a3a4, team("A", 4)))).status, 200);
  await assertKnockoutIntegrity(2);
  await assertStandingsMatchScores();
  const rebuilt = [await knockout(QUARTAS, 0), await knockout(QUARTAS, 1)];
  assert.deepEqual(rebuilt.map((match) => [match.teamAId, match.teamBId]), [[team("A", 4), team("A", 6)], [team("A", 3), team("A", 5)]]);
  assert.ok(![q1.id, q2.id].includes(rebuilt[0].id) && ![q1.id, q2.id].includes(rebuilt[1].id), "os jogos antigos do chaveamento foram desfeitos");
  // Volta ao placar original (a3 em 3º), ainda sem placar de mata-mata.
  assert.equal((await post(a3a4, ADMIN, scoreFor(a3a4, team("A", 3)))).status, 200);
  q1 = await knockout(QUARTAS, 0);
  q2 = await knockout(QUARTAS, 1);
  assert.deepEqual([q1.teamAId, q1.teamBId], [team("A", 3), team("A", 6)]);

  // Quartas 1: permissões, cadeado, placar inválido, correção com o mesmo vencedor.
  assert.equal((await post(q1, playersOf(team("A", 1))[0], { setsA: 2, setsB: 0 })).status, 403, "quem espera na semifinal não lança as quartas dos outros");
  assert.equal((await post(q1, playersOf(team("A", 7))[0], { setsA: 2, setsB: 0 })).status, 403, "eliminado não lança");
  assert.equal((await post(q1, playersOf(q1.teamAId)[0], { setsA: 2, setsB: 3 })).status, 400);
  assert.equal((await post(q1, playersOf(q1.teamAId)[0], { setsA: 2, setsB: 0 })).status, 200);
  assert.equal((await post(q1, playersOf(q1.teamAId)[1], { setsA: 2, setsB: 1 })).status, 200, "o parceiro corrige mantendo o vencedor");
  assert.deepEqual((await call<Match[]>("GET", "/api/matches?stage=mata-mata", playersOf(q1.teamBId)[0])).body.find((match) => match.id === q1.id)!.result, { setsA: 2, setsB: 1 });
  await call("POST", "/api/admin/results-lock", ADMIN, { locked: true });
  assert.equal((await post(q1, playersOf(q1.teamBId)[0], { setsA: 2, setsB: 0 })).body.code, "results_locked");
  assert.equal((await post(q1, ADMIN, { setsA: 2, setsB: 0 })).status, 200);
  await call("POST", "/api/admin/results-lock", ADMIN, { locked: false });
  // As Quartas 1 abrem a Semifinal 2 (2º × vencedor das Quartas 1); a Semifinal 1 espera as Quartas 2.
  await assertKnockoutIntegrity(3);
  let s2 = await knockout(SEMI, 1);
  assert.deepEqual([s2.teamAId, s2.teamBId], [team("A", 2), team("A", 3)]);
  assert.equal(await hasKnockout(SEMI, 0), false, "a Semifinal 1 espera as Quartas 2");

  // Correção de grupo DEPOIS do primeiro placar de mata-mata: recusada para todos.
  for (const who of [playersOf(team("A", 4))[0], ADMIN]) {
    const refused = await post(a3a4, who, scoreFor(a3a4, team("A", 4)));
    assert.deepEqual([refused.status, refused.body.code], [409, "result_conflict"]);
    assert.match(refused.body.message!, /mata-mata já tem placar lançado \(Quartas 1\).*não podem mais ser alterados/);
  }
  assert.deepEqual((await groupMatches()).find((match) => match.id === a3a4.id)!.result, scoreFor(a3a4, team("A", 3)), "o placar de grupo não mudou");

  // Vencedor das Quartas 1 trocado antes de a semifinal ter placar: a semifinal troca de dupla.
  assert.equal((await post(q1, playersOf(q1.teamBId)[0], { setsA: 1, setsB: 2 })).status, 200);
  s2 = await knockout(SEMI, 1);
  assert.deepEqual([s2.teamAId, s2.teamBId], [team("A", 2), team("A", 6)]);
  assert.equal((await post(s2, playersOf(team("A", 3))[0], { setsA: 2, setsB: 0 })).status, 403, "a dupla que deixou de ser vencedora não lança a semifinal");
  assert.equal((await post(q1, playersOf(q1.teamAId)[1], { setsA: 2, setsB: 1 })).status, 200);
  s2 = await knockout(SEMI, 1);
  assert.deepEqual([s2.teamAId, s2.teamBId], [team("A", 2), team("A", 3)]);

  // Quartas 2 (vence o 5º) → Semifinal 1: 1º × 5º.
  await playKnockout(QUARTAS, 1, "B");
  await assertKnockoutIntegrity(4);
  let s1 = await knockout(SEMI, 0);
  assert.deepEqual([s1.teamAId, s1.teamBId], [team("A", 1), team("A", 5)]);

  // Semifinal 2 lançada → o vencedor das Quartas 1 não troca mais; final e 3º lugar ainda esperam a Semifinal 1.
  assert.equal((await post(s2, playersOf(s2.teamAId)[0], { setsA: 2, setsB: 0 })).status, 200);
  const lateSwap = await post(q1, playersOf(q1.teamBId)[0], { setsA: 0, setsB: 2 });
  assert.deepEqual([lateSwap.status, lateSwap.body.code], [409, "result_conflict"]);
  assert.match(lateSwap.body.message!, /Semifinal 2 já foi disputada/);
  assert.equal(await hasKnockout(FINAL), false, "a final espera as duas semifinais");
  assert.equal(await hasKnockout(TERCEIRO), false, "a disputa de 3º lugar espera as duas semifinais");

  // Semifinal 1 → final (vencedores) e 3º lugar (perdedores) nascem juntos.
  assert.equal((await post(s1, playersOf(s1.teamAId)[0], { setsA: 2, setsB: 0 })).status, 200);
  await assertKnockoutIntegrity(6);
  let final = await knockout(FINAL, 0);
  let third = await knockout(TERCEIRO, 0);
  assert.deepEqual([final.teamAId, final.teamBId], [team("A", 1), team("A", 2)]);
  assert.deepEqual([third.teamAId, third.teamBId], [team("A", 5), team("A", 3)]);
  // Troca do vencedor da Semifinal 1 antes da final e do 3º lugar: as duas trocam de dupla.
  assert.equal((await post(s1, playersOf(s1.teamBId)[0], { setsA: 1, setsB: 2 })).status, 200);
  [final, third] = [await knockout(FINAL, 0), await knockout(TERCEIRO, 0)];
  assert.deepEqual([[final.teamAId, final.teamBId], [third.teamAId, third.teamBId]], [[team("A", 5), team("A", 2)], [team("A", 1), team("A", 3)]]);
  assert.equal((await post(s1, ADMIN, { setsA: 2, setsB: 1 })).status, 200);
  [final, third] = [await knockout(FINAL, 0), await knockout(TERCEIRO, 0)];
  assert.deepEqual([[final.teamAId, final.teamBId], [third.teamAId, third.teamBId]], [[team("A", 1), team("A", 2)], [team("A", 5), team("A", 3)]]);
  assert.deepEqual([(await status()).editionFinished, (await editionFiveRows()).length], [false, 0]);

  // 3º lugar: só as duas duplas que perderam as semifinais lançam.
  assert.equal((await post(third, playersOf(team("A", 1))[0], { setsA: 2, setsB: 0 })).status, 403, "finalista não lança o 3º lugar");
  assert.equal((await post(third, playersOf(team("A", 4))[0], { setsA: 2, setsB: 0 })).status, 403, "quem caiu nas quartas não lança o 3º lugar");

  // Final: campeão registrado na hora, mas a edição continua aberta até o 3º lugar.
  assert.equal((await post(final, playersOf(team("A", 3))[0], { setsA: 2, setsB: 0 })).status, 403);
  assert.equal((await post(final, playersOf(final.teamBId)[1], { setsA: 1, setsB: 2 })).status, 200);
  await assertKnockoutIntegrity(6);
  let current = await status();
  assert.deepEqual(
    [current.phase, current.editionFinished, current.champion?.teamId, current.runnerUp?.teamId, current.finalResult, current.syncPending, current.anomalies],
    ["Mata-mata", false, team("A", 2), team("A", 1), "2x1", false, []],
  );
  assert.deepEqual((await editionFiveRows()).map((entry) => entry.champions), [["Jogador 3", "Jogador 4"]], "campeão já no Hall da Fama");
  // Com a final disputada, o vencedor da semifinal não troca mais (nem pelo administrador).
  const semiSwap = await post(s1, ADMIN, { setsA: 0, setsB: 2 });
  assert.deepEqual([semiSwap.status, semiSwap.body.code], [409, "result_conflict"]);
  // Os finalistas ainda podem corrigir a final enquanto o 3º lugar não terminou.
  assert.equal((await post(final, playersOf(final.teamBId)[0], { setsA: 0, setsB: 2 })).status, 200);
  assert.equal((await editionFiveRows())[0].finalResult, "2x0");

  // 3º lugar: a edição encerra.
  assert.equal((await post(third, playersOf(third.teamBId)[0], { setsA: 1, setsB: 2 })).status, 200);
  await assertKnockoutIntegrity(6);
  current = await status();
  assert.deepEqual(
    [current.phase, current.editionFinished, current.champion?.teamId, current.runnerUp?.teamId, current.finalResult, current.syncPending, current.anomalies],
    ["Campeonato Finalizado", true, team("A", 2), team("A", 1), "2x0", false, []],
  );
  assert.equal((await groupMatches()).length + (await knockoutMatches()).length, 27, "21 jogos de grupo + 6 de mata-mata");
  let hall = (await call<HallOfFame>("GET", "/api/history", null)).body;
  assert.deepEqual(hall.editions.map((entry) => entry.edition), [1, 2, 3, 4, 5], "exatamente uma linha por edição");
  assert.deepEqual([hall.editions[4].champions, hall.editions[4].runnersUp, hall.editions[4].finalResult, hall.currentEdition], [["Jogador 3", "Jogador 4"], ["Jogador 1", "Jogador 2"], "2x0", 5]);
  // As quatro edições anteriores continuam idênticas.
  assert.deepEqual(hall.editions.slice(0, 4).map((entry) => entry.champions), [["Jogador 1", "Jogador 2"], ["Jogador 1", "Jogador 2"], ["Jogador 15", "Jogador 16"], ["Jogador 3", "Jogador 4"]]);
  let major = (await call<MajorChampionEntry[]>("GET", "/api/history/major-champions", p1)).body;
  assert.deepEqual(major.filter((entry) => entry.titles > 0).map((entry) => [entry.name, entry.titles, entry.editions]), [
    ["Jogador 1 & Jogador 2", 2, [1, 2]], ["Jogador 3 & Jogador 4", 2, [4, 5]], ["Jogador 15 & Jogador 16", 1, [3]],
  ]);
  const dashboard = (await call("GET", "/api/dashboard", ADMIN)).body;
  assert.deepEqual([dashboard.currentPhase, dashboard.champion], ["Campeonato Finalizado", { teamId: team("A", 2), teamName: "Jogador 3 & Jogador 4" }]);

  // Depois do encerramento: jogador não lança nem edita nada; o administrador ainda corrige.
  for (const [match, player] of [[final, playersOf(final.teamBId)[0]], [first, p1], [third, playersOf(third.teamAId)[0]]] as Array<[Match, string]>) {
    const refused = await post(match, player, { setsA: 2, setsB: 0 });
    assert.deepEqual([refused.status, refused.body], [403, { message: EDITION_FINISHED_MESSAGE, code: "edition_finished" }]);
  }
  assert.equal((await post(final, ADMIN, { setsA: 2, setsB: 1 })).status, 200, "o administrador troca o vencedor da final");
  hall = (await call<HallOfFame>("GET", "/api/history", null)).body;
  assert.deepEqual(hall.editions.map((entry) => entry.edition), [1, 2, 3, 4, 5], "continua uma linha só");
  assert.deepEqual([hall.editions[4].champions, hall.editions[4].runnersUp, hall.editions[4].finalResult], [["Jogador 1", "Jogador 2"], ["Jogador 3", "Jogador 4"], "2x1"]);
  major = (await call<MajorChampionEntry[]>("GET", "/api/history/major-champions", p1)).body;
  assert.deepEqual(major.filter((entry) => entry.titles > 0).map((entry) => [entry.name, entry.titles, entry.editions]), [
    ["Jogador 1 & Jogador 2", 3, [1, 2, 5]], ["Jogador 15 & Jogador 16", 1, [3]], ["Jogador 3 & Jogador 4", 1, [4]],
  ]);
  current = await status();
  assert.deepEqual([current.editionFinished, current.champion?.teamId], [true, team("A", 1)]);
  assert.equal((await post(third, ADMIN, { setsA: 2, setsB: 0 })).status, 200, "o administrador corrige o 3º lugar");
  assert.deepEqual([(await status()).editionFinished, (await status()).champion?.teamId], [true, team("A", 1)], "corrigir o 3º lugar não mexe no campeão");
  assert.equal((await post(a3a4, ADMIN, scoreFor(a3a4, team("A", 4)))).status, 409);
  await assertKnockoutIntegrity(6);

  // O que o navegador lê direto do Supabase (emulado no ensaio) mostra o mesmo campeão.
  const rest5 = (await (await realFetch(base + "/rest/v1/truco_history")).json() as Array<{ edition: number; champion: { truco_team_members: Array<{ truco_players: { name: string } }> } }>).find((row) => row.edition === 5)!;
  assert.deepEqual(rest5.champion.truco_team_members.map((member) => member.truco_players.name), ["Jogador 1", "Jogador 2"]);
  const audit = (await call("GET", "/api/matches/audit", ADMIN)).body as Array<{ action: string }>;
  assert.ok(audit.some((row) => row.action === "result_created") && audit.some((row) => row.action === "result_updated"));
});

// ---------- 3. Fase de grupos sem ordem obrigatória ----------

test("o jogo de maior ordem pode ser lançado antes do de menor, e um placar pode ser editado várias vezes", async () => {
  await fresh();
  const matches = (await groupMatches()).sort((a, b) => b.order - a.order);
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
    const rows = await standings();
    const winner = score.setsA > score.setsB ? last.teamAId : last.teamBId;
    assert.equal(rows[0].teamId, winner, "com um jogo só, quem venceu lidera");
    assert.deepEqual([rows[0].pontos, rows.find((row) => row.teamId !== winner && row.jogos === 1)!.pontos], Math.min(score.setsA, score.setsB) === 0 ? [3, 0] : [2, 1]);
  }
  assert.equal((await groupMatches()).filter((match) => match.status === "realizado").length, 1, "editar não cria jogo nem mexe nos outros");
});

for (const seed of [7, 2026, 90210]) {
  test(`os 21 resultados em ordem aleatória (semente ${seed}), alternando jogadores: mata-mata ausente até o 20º e presente no 21º`, async () => {
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

    // Com os 21: ou a classificação está definida e o mata-mata existe, ou há empate absoluto e ele espera o administrador.
    let current = await status();
    let guard = 0;
    while (current.groupStage === "empate-pendente") {
      assert.deepEqual([(await bracket()).length, (await knockoutMatches()).length], [0, 0], "empate absoluto: nada é gerado nem sorteado");
      const pending = (await standings()).filter((row) => row.tiePending);
      const sameTie = (row: StandingRow) => [row.pontos, row.vitorias, row.vitorias2x0, row.confrontoDireto, row.saldoSets].join();
      const cluster = pending.filter((row) => sameTie(row) === sameTie(pending[0]));
      assert.equal((await call("POST", "/api/groups/A/tiebreak", ADMIN, { orderedTeamIds: cluster.map((row) => row.teamId).reverse() })).status, 201);
      current = await status();
      assert.ok((guard += 1) < 6);
    }
    assert.equal(current.groupStage, "definida");
    await assertKnockoutIntegrity(2);
    const rows = await standings();
    const at = (position: number) => rows.find((row) => row.position === position)!.teamId;
    const [q1, q2] = [await knockout(QUARTAS, 0), await knockout(QUARTAS, 1)];
    assert.deepEqual([[q1.teamAId, q1.teamBId], [q2.teamAId, q2.teamBId]], [[at(3), at(6)], [at(4), at(5)]]);
  });
}

// ---------- 4. Empate absoluto ----------

/** a1 vence a2, a2 vence a3, a3 vence a1; os três vencem os demais; tudo 2x0: empate absoluto pelo 1º, 2º e 3º lugares. */
const triangle = (match: Match) => {
  const pair = [seedOf(match.teamAId), seedOf(match.teamBId)].sort().join("");
  return pair === "13" ? team("A", 3) : favourite(match);
};

test("empate absoluto: o mata-mata não é gerado nem sorteado; a decisão do administrador gera na mesma chamada", async () => {
  await fresh();
  await playGroupMatches(await groupMatches(), triangle);
  const pending = await status();
  assert.deepEqual([pending.groupStage, pending.pendingTieGroups, pending.bracketGenerated, pending.phase], ["empate-pendente", ["A"], false, "Fase de Grupos"]);
  assert.deepEqual([(await bracket()).length, (await knockoutMatches()).length], [0, 0]);
  const rows = await standings();
  assert.deepEqual(rows.map((row) => row.tiePending), [true, true, true, false, false, false, false]);
  const generate = await call("POST", "/api/bracket/generate", ADMIN);
  assert.equal(generate.status, 409);
  assert.match(generate.body.message, /empate sem critério de desempate/);

  const decision = { orderedTeamIds: [team("A", 2), team("A", 3), team("A", 1)] };
  assert.equal((await call("POST", "/api/groups/A/tiebreak", playersOf(team("A", 1))[0], decision)).status, 403, "só o administrador decide");
  assert.equal((await call("POST", "/api/groups/A/tiebreak", ADMIN, { orderedTeamIds: [team("A", 2), team("A", 3)] })).status, 409, "a decisão precisa cobrir o empate inteiro");
  assert.equal((await bracket()).length, 0);
  const decided = await call<StandingRow[]>("POST", "/api/groups/A/tiebreak", ADMIN, decision);
  assert.equal(decided.status, 201);
  assert.deepEqual(decided.body.map((row) => row.teamId), [2, 3, 1, 4, 5, 6, 7].map((index) => team("A", index)));
  await assertKnockoutIntegrity(2);
  const q1 = await knockout(QUARTAS, 0);
  assert.deepEqual([q1.teamAId, q1.teamBId], [team("A", 1), team("A", 6)], "a1 decidido em 3º joga as quartas contra o 6º");
  assert.equal((await call("POST", "/api/groups/A/tiebreak", ADMIN, decision)).status, 409, "com o mata-mata gerado não há mais empate a decidir");

  // Uma correção de grupo que desfaz o empate (a1 passa a vencer a3) refaz o mata-mata pela tabela nova.
  const a1a3 = (await groupMatches()).find((match) => [match.teamAId, match.teamBId].sort().join() === [team("A", 1), team("A", 3)].join())!;
  assert.equal((await post(a1a3, playersOf(team("A", 1))[0], scoreFor(a1a3, team("A", 1)))).status, 200);
  await assertKnockoutIntegrity(2);
  assert.deepEqual((await knockout(QUARTAS, 0)).teamAId, team("A", 3));
  // Volta o triângulo: o empate reabre e o mata-mata some de novo até nova decisão (a anterior continua valendo).
  assert.equal((await post(a1a3, playersOf(team("A", 3))[0], scoreFor(a1a3, team("A", 3)))).status, 200);
  await assertKnockoutIntegrity(2);
  assert.deepEqual((await knockout(QUARTAS, 0)).teamAId, team("A", 1), "a decisão gravada do administrador volta a valer");
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
      const lastTwo = [all.at(-1)!, all.at(round % 2 ? -2 : -3)!];
      const others = all.filter((match) => !lastTwo.includes(match));
      await playGroupMatches(others.slice(1));
      const early = others[0];
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

      // As duas quartas juntas, cada uma lançada pelas duas duplas ao mesmo tempo.
      const [q1, q2] = [await knockout(QUARTAS, 0), await knockout(QUARTAS, 1)];
      await both(
        post(q1, playersOf(q1.teamAId)[0], { setsA: 2, setsB: 0 }), post(q1, playersOf(q1.teamBId)[0], { setsA: 2, setsB: 1 }),
        post(q2, playersOf(q2.teamAId)[1], { setsA: 0, setsB: 2 }), post(q2, playersOf(q2.teamBId)[1], { setsA: 1, setsB: 2 }),
      );
      await assertKnockoutIntegrity(4);

      // As duas semifinais juntas: final e 3º lugar nascem uma vez só.
      const [s1, s2] = [await knockout(SEMI, 0), await knockout(SEMI, 1)];
      await both(
        post(s1, playersOf(s1.teamAId)[0], { setsA: 2, setsB: 0 }), post(s1, playersOf(s1.teamBId)[0], { setsA: 2, setsB: 1 }),
        post(s2, playersOf(s2.teamAId)[0], { setsA: 2, setsB: 1 }), post(s2, playersOf(s2.teamBId)[1], { setsA: 2, setsB: 0 }),
      );
      await assertKnockoutIntegrity(6);
      assert.equal((await editionFiveRows()).length, 0);

      // Final e 3º lugar ao mesmo tempo.
      const [final, third] = [await knockout(FINAL, 0), await knockout(TERCEIRO, 0)];
      await both(post(final, playersOf(final.teamAId)[0], { setsA: 2, setsB: 0 }), post(third, playersOf(third.teamBId)[0], { setsA: 0, setsB: 2 }));
      let current = await status();
      assert.deepEqual([current.editionFinished, current.champion?.teamId], [true, final.teamAId]);
      // Depois do encerramento os quatro finalistas tentam ao mesmo tempo: todos levam 403.
      const replies = await Promise.all([...playersOf(final.teamAId), ...playersOf(final.teamBId)].map((player) => post(final, player, { setsA: 0, setsB: 2 })));
      assert.ok(replies.every((reply) => reply.status === 403 && reply.body.code === "edition_finished"));
      // O administrador corrige a final duas vezes ao mesmo tempo, trocando o vencedor.
      await both(post(final, ADMIN, { setsA: 0, setsB: 2 }), post(final, ADMIN, { setsA: 1, setsB: 2 }));
      store.latencyMs = 0;
      await assertKnockoutIntegrity(6);
      const rows = await editionFiveRows();
      assert.equal(rows.length, 1, "o histórico tem exatamente uma linha da edição");
      assert.equal((await call<HallOfFame>("GET", "/api/history", null)).body.editions.length, 5);
      current = await status();
      assert.deepEqual([current.editionFinished, current.champion?.teamId, current.syncPending], [true, final.teamBId, false]);
    }
  });
}

test("modelo em memória de chamadas sem fila: unicidade simulada e sincronização convergem (não valida o banco)", async () => {
  let conflictsAbsorbed = 0;
  for (let round = 0; round < 12; round += 1) {
    await fresh();
    const store = rehearsalStore();
    const all = await groupMatches();
    const lastTwo = [all.at(-1)!, all.at(-2)!];
    await playGroupMatches(all.filter((match) => !lastTwo.includes(match)));
    store.latencyMs = 3;
    const actor = { id: "ensaio-conta-admin", role: "superadmin" as const };
    // Cada chamada "sem fila" faz o papel de uma instância diferente recebendo o lançamento.
    const outcomes = await Promise.allSettled(lastTwo.flatMap((match) => [0, 1].map(() => recordResultUnlocked(CHAMPIONSHIP, match.id, scoreFor(match, favourite(match)), actor))));
    conflictsAbsorbed += outcomes.filter((outcome) => outcome.status === "rejected").length;
    await syncKnockout(CHAMPIONSHIP);
    await assertKnockoutIntegrity(2);

    const [q1, q2] = [await knockout(QUARTAS, 0), await knockout(QUARTAS, 1)];
    await Promise.allSettled([q1, q1, q2, q2].map((match) => recordResultUnlocked(CHAMPIONSHIP, match.id, { setsA: 2, setsB: 0 }, actor)));
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
  assert.equal((await groupMatches()).filter((match) => match.status === "realizado").length, 21, "os 21 placares estão gravados");
  const pending = await status();
  assert.deepEqual([pending.bracketGenerated, pending.syncPending, pending.groupStage], [false, true, "definida"]);
  assert.equal((await bracket(playersOf(team("A", 7))[1])).length, 0, "GET não altera o campeonato");
  await recoverPendingKnockout();
  assert.equal((await bracket()).length, 6);
  await assertKnockoutIntegrity(2);
});

test("falha repetida entre criar o jogo e vincular: o jogo solto é adotado depois, nunca criado de novo", async () => {
  const last = await untilLastGroupMatch();
  rehearsalStore().failNext("linkBracketMatch", 2);
  assert.equal((await lastPost(last)).status, 503);
  const loose = await knockoutMatches();
  assert.equal(loose.length, 1, "um jogo das quartas foi criado, mas ficou sem vínculo");
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
  const q1 = await knockout(QUARTAS, 0);
  assert.deepEqual([q1.teamAId, q1.teamBId], [team("A", 4), team("A", 6)], "o chaveamento refeito usa a classificação corrigida");
});

test("falha ao trocar as duplas da final e do 3º lugar e ao registrar o campeão: a rodada seguinte conserta", async () => {
  await fresh();
  await finishGroupStage();
  await playKnockout(QUARTAS, 0);
  await playKnockout(QUARTAS, 1);
  await playKnockout(SEMI, 1);
  const s1 = await playKnockout(SEMI, 0);
  assert.equal((await knockout(FINAL, 0)).teamAId, s1.teamAId);
  // Vencedor da Semifinal 1 trocado, mas a troca das duplas na final e no 3º lugar falha três vezes seguidas.
  rehearsalStore().failNext("setMatchTeam", 3);
  assert.equal((await post(s1, ADMIN, scoreFor(s1, s1.teamBId))).status, 503);
  assert.equal((await knockout(FINAL, 0)).teamAId, s1.teamAId, "a final ficou com a dupla antiga");
  await recoverPendingKnockout();
  assert.equal((await knockout(FINAL, 0)).teamAId, s1.teamBId, "a consulta seguinte trocou a dupla da final");
  assert.equal((await knockout(TERCEIRO, 0)).teamAId, s1.teamAId, "e a do 3º lugar");

  await playKnockout(TERCEIRO, 0);
  const final = await knockout(FINAL, 0);
  rehearsalStore().failNext("saveEditionChampion", 2);
  assert.equal((await post(final, playersOf(final.teamAId)[0], { setsA: 2, setsB: 1 })).status, 503);
  let current = await status();
  assert.deepEqual([current.editionFinished, current.syncPending, (await editionFiveRows()).length], [false, true, 0], "sem campeão gravado a edição não é dada como encerrada");
  await recoverPendingKnockout();
  current = await status();
  assert.deepEqual([current.editionFinished, current.champion?.teamId, current.finalResult, (await editionFiveRows()).length], [true, final.teamAId, "2x1", 1]);
  await assertKnockoutIntegrity(6);
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
  await playKnockout(QUARTAS, 0);
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
  for (const round of [QUARTAS, SEMI]) {
    await playKnockout(round, 0); await playKnockout(round, 1);
  }
  await playKnockout(TERCEIRO, 0);
  const final = await playKnockout(FINAL, 0);
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
  const match = await knockout(QUARTAS, 0);
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
