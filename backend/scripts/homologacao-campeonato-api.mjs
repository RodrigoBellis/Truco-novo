// Campeonato inteiro pela API, contra DUAS instâncias do backend em MODO HOMOLOGAÇÃO ligadas ao
// mesmo PostgreSQL local (schema real + migrations pendentes). 27 partidas (21 do grupo único + 6 de mata-mata), com as checagens de
// segurança, concorrência entre instâncias, correções, reenvio, recuperação e conexão perdida.
//
//   node backend/scripts/homologacao-local.mjs up
//   (instância A) npm run dev:homologacao --workspace backend              -> 3101
//   (instância B) PORT=3102 npm run dev:homologacao --workspace backend    -> 3102
//   node backend/scripts/homologacao-campeonato-api.mjs [semente]
//
// Só fala com 127.0.0.1. As conferências de banco usam o psql local como dono do cluster,
// sempre em consultas de leitura — exceto os dois testes de falha, que estão marcados.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGroupRounds, pairKey } from "../../shared/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INSTANCES = ["http://127.0.0.1:3101", "http://127.0.0.1:3102"];
const seedArg = Number(process.argv[2] ?? 20261025);
const pgBin = [process.env.PG_BIN, ...["18", "17", "16", "15"].map((v) => `C:/Program Files/PostgreSQL/${v}/bin`)].filter(Boolean).find((dir) => existsSync(join(dir, "psql.exe")) || existsSync(join(dir, "psql")));

// ---------- apoio ----------
let state = seedArg >>> 0;
const random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (list) => list[Math.floor(random() * list.length)];
const shuffle = (list) => { const copy = [...list]; for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const results = [];
function check(area, name, ok, evidence = "") {
  results.push({ area, name, status: ok ? "PASSOU" : "FALHOU", evidence: String(evidence) });
  console.log(`${ok ? "PASSOU " : "FALHOU "} [${area}] ${name}${evidence ? " — " + evidence : ""}`);
}
function untested(area, name, reason) {
  results.push({ area, name, status: "NÃO TESTADO", evidence: reason });
  console.log(`NÃO TESTADO [${area}] ${name} — ${reason}`);
}

function sql(query) {
  return execFileSync(join(pgBin, "psql"), ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", "55450", "-U", "postgres", "-d", "truco_homologacao", "-c", query], { encoding: "utf8", env: { ...process.env, PGCLIENTENCODING: "UTF8" } }).trim();
}
const TABLES = ["truco_audit_log", "truco_bracket_matches", "truco_championships", "truco_groups", "truco_history", "truco_matches", "truco_players", "truco_profiles", "truco_standings_overrides", "truco_team_members", "truco_team_memberships", "truco_teams"];
const snapshot = () => sql(`select string_agg(t || ':' || h, ',' order by t) from (${TABLES.map((table) => `select '${table}' t, (select count(*) || '/' || md5(coalesce(string_agg(x::text, '' order by x.truco_id), '')) from public.${table} x) h`).join(" union all ")}) s`);

const tokens = [new Map(), new Map()];
async function call(instance, method, path, playerId, body) {
  const headers = { "Content-Type": "application/json" };
  if (playerId) headers.Authorization = "Bearer " + tokens[instance].get(playerId);
  try {
    const response = await fetch(INSTANCES[instance] + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
    return { status: response.status, body: json };
  } catch (error) {
    return { status: 0, body: { message: String(error) } };
  }
}
const post = (instance, matchId, playerId, score) => call(instance, "POST", `/api/matches/${matchId}/result`, playerId, score);

// ---------- preparação ----------
for (const [index, url] of INSTANCES.entries()) {
  const health = await fetch(url + "/api/health").then((r) => r.json()).catch(() => null);
  if (!health) { console.error(`Instância ${index === 0 ? "A" : "B"} (${url}) fora do ar.`); process.exit(2); }
}
check("isolamento", "banco conferido é o local de homologação", sql("select nome from homologacao.ambiente") === "truco-homologacao-local" && sql("select host(inet_server_addr())") === "127.0.0.1", "marcador + 127.0.0.1:55450");

check("preparação", "reset da homologação", (await call(0, "POST", "/api/rehearsal/reset")).status === 204);
const status = (await call(0, "GET", "/api/rehearsal/status")).body;
const ADMIN = status.ids.admin;
for (const instance of [0, 1]) {
  for (const account of status.accounts) {
    const login = await call(instance, "POST", "/api/auth/login", null, { playerId: account.playerId, password: status.password });
    if (login.status !== 200) { console.error("login falhou", account.name, login.status, login.body); process.exit(2); }
    tokens[instance].set(account.playerId, login.body.token);
  }
}
check("autenticação fictícia", "15 contas fictícias entram nas duas instâncias", tokens[0].size === 15 && tokens[1].size === 15, "14 jogadores + 1 administrador; nenhuma conta no Supabase Auth");
check("autenticação fictícia", "senha errada é recusada", (await call(0, "POST", "/api/auth/login", null, { playerId: status.accounts[0].playerId, password: "errada-123" })).status !== 200);
check("autenticação fictícia", "token de uma instância não vale na outra (segredo por processo)", (await fetch(INSTANCES[1] + "/api/teams", { headers: { Authorization: "Bearer " + tokens[0].get(ADMIN) } })).status === 401);
check("autenticação fictícia", "sem token a API responde 401", (await call(0, "GET", "/api/teams", null)).status === 401);

const teams = (await call(0, "GET", "/api/teams", ADMIN)).body;
let groupMatches = (await call(0, "GET", "/api/matches?stage=grupos", ADMIN)).body;
check("preparação", "7 duplas no grupo único e 21 jogos gerados pelas regras do sistema", teams.length === 7 && groupMatches.length === 21 && teams.every((t) => t.groupId === "A") && groupMatches.every((m) => m.groupId === "A"));
const visualRounds = buildGroupRounds([...teams].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map((t) => t.id));
const roundByPair = new Map(visualRounds.flatMap((r) => r.tables.map((t) => [pairKey(t.teamAId, t.teamBId), r.round])));
check("rodadas (código)", "7 rodadas, 3 mesas, 1 descanso, sem dupla repetida na rodada", visualRounds.length === 7 && visualRounds.every((r) => r.tables.length === 3 && r.restingTeamId && new Set(r.tables.flatMap((t) => [t.teamAId, t.teamBId]).concat(r.restingTeamId)).size === 7 && r.tables.map((t) => t.table).join() === "1,2,3"));
check("rodadas (código)", "21 pares únicos cobrem os jogos; cada dupla descansa uma vez", roundByPair.size === 21 && groupMatches.every((m) => roundByPair.has(pairKey(m.teamAId, m.teamBId))) && new Set(visualRounds.map((r) => r.restingTeamId)).size === 7);
const team = (id) => teams.find((item) => item.id === id);
const membersOf = (teamId) => [team(teamId).player1Id, team(teamId).player2Id];
const slotOf = (teamId) => (Number(/\d+/.exec(team(teamId).name)[0]) + 1) / 2;
const outsiderOf = (match) => pick(teams.filter((t) => t.id !== match.teamAId && t.id !== match.teamBId).flatMap((t) => membersOf(t.id)));
const anyPlayerOf = (match) => pick([...membersOf(match.teamAId), ...membersOf(match.teamBId)]);
/** Placar em que `winner` vence e o perdedor faz `loser` quedas. */
const scoreFor = (match, winner, loser) => (match.teamAId === winner ? { setsA: 2, setsB: loser } : { setsA: loser, setsB: 2 });
const winnerOf = (match, score) => (score.setsA > score.setsB ? match.teamAId : match.teamBId);
const loserOf = (match, score) => (score.setsA > score.setsB ? match.teamBId : match.teamAId);
const ledger = new Map();

/** Classificação independente: pontos 3/2/1/0, vitórias, vitórias por 2x0, confronto direto, saldo. */
function expectedStandings() {
  const rows = teams.map((t) => ({ teamId: t.id, pts: 0, v: 0, x20: 0, saldo: 0 }));
  const games = groupMatches.filter((m) => ledger.has(m.id));
  for (const match of games) {
    const score = ledger.get(match.id);
    for (const [id, mine, theirs] of [[match.teamAId, score.setsA, score.setsB], [match.teamBId, score.setsB, score.setsA]]) {
      const row = rows.find((item) => item.teamId === id);
      row.saldo += mine - theirs;
      if (mine > theirs) { row.v += 1; row.pts += theirs === 0 ? 3 : 2; if (theirs === 0) row.x20 += 1; } else row.pts += mine === 1 ? 1 : 0;
    }
  }
  const key = (row) => `${row.pts}/${row.v}/${row.x20}`;
  // Confronto direto: vitórias nos jogos entre as duplas empatadas nos três primeiros critérios.
  const direct = (row, tied) => games.filter((m) => tied.includes(m.teamAId) && tied.includes(m.teamBId) && winnerOf(m, ledger.get(m.id)) === row.teamId).length;
  return rows.sort((a, b) => {
    if (key(a) !== key(b)) return b.pts - a.pts || b.v - a.v || b.x20 - a.x20;
    const tied = rows.filter((row) => key(row) === key(a)).map((row) => row.teamId);
    return direct(b, tied) - direct(a, tied) || b.saldo - a.saldo;
  });
}
async function standings(instance = 0) { return (await call(instance, "GET", "/api/groups/A/standings", ADMIN)).body; }
async function standingsMatch(label, instance = 0) {
  const rows = await standings(instance);
  const got = [...rows].sort((a, b) => a.position - b.position).map((row) => row.teamId);
  const expected = expectedStandings();
  const statsMatch = rows.every((row) => {
    const own = expected.find((r) => r.teamId === row.teamId);
    return own && row.pontos === own.pts && row.vitorias === own.v && row.vitorias2x0 === own.x20 && row.saldoSets === own.saldo;
  });
  if (JSON.stringify(got) !== JSON.stringify(expected.map((r) => r.teamId)) || !statsMatch || rows.some((row) => row.tiePending)) { check("classificação", label, false, "ordem ou estatísticas do grupo único divergentes"); return false; }
  return true;
}
const bracket = async (instance = 0) => (await call(instance, "GET", "/api/bracket", ADMIN)).body;
const knockout = async (instance = 0) => (await call(instance, "GET", "/api/matches?stage=mata-mata", ADMIN)).body;
const ROUND = { Q: "Quartas de final", S: "Semifinal", T: "Disputa de 3º lugar", F: "Final" };
const ko = async (key) => (await knockout()).find((m) => m.round === ROUND[key[0]] && m.order === (key.length > 1 ? Number(key[1]) - 1 : 0));
async function integrity(label, expectedGames) {
  const rows = await bracket(1); const games = await knockout(0);
  const dbDuplicates = sql("select (select count(*) from (select 1 from public.truco_bracket_matches group by truco_championship_id, round, match_order having count(*) > 1) d) + (select count(*) from (select 1 from public.truco_matches where stage = 'mata-mata' group by truco_championship_id, round, match_order having count(*) > 1) d)");
  const ok = rows.length === 6 && new Set(rows.map((r) => r.round + "#" + r.order)).size === 6 && games.length === expectedGames
    && JSON.stringify(rows.flatMap((r) => (r.matchId ? [r.matchId] : [])).sort()) === JSON.stringify(games.map((g) => g.id).sort()) && dbDuplicates === "0";
  check("mata-mata", label, ok, `${rows.length} confrontos, ${games.length} jogos, duplicados no banco: ${dbDuplicates}`);
  return ok;
}
const auditCount = (matchId) => Number(sql(`select count(*) from public.truco_audit_log where entity = 'match_result' and entity_id = '${matchId}'`));
const pending = () => sql("select progression_pending from public.truco_championships where status = 'em_andamento'") === "t";
async function settled() { for (let i = 0; i < 40 && pending(); i += 1) await sleep(250); return !pending(); }

// ---------- 1. cadeado ----------
const first = groupMatches[0];
const lockedBefore = snapshot();
const refusedLocked = await post(0, first.id, anyPlayerOf(first), { setsA: 2, setsB: 0 });
check("cadeado", "fechado: jogador recebe 403 results_locked", refusedLocked.status === 403 && refusedLocked.body.code === "results_locked", `HTTP ${refusedLocked.status}`);
check("cadeado", "fechado: nada foi gravado (12 tabelas idênticas)", snapshot() === lockedBefore);
check("cadeado", "jogador não consegue abrir o cadeado", (await call(0, "POST", "/api/admin/results-lock", anyPlayerOf(first), { locked: false })).status === 403);
check("cadeado", "administrador abre o cadeado", (await call(0, "POST", "/api/admin/results-lock", ADMIN, { locked: false })).status === 200 && (await call(1, "GET", "/api/matches/lock", ADMIN)).body.locked === false, "visto pela outra instância");

// ---------- 2. permissões ----------
const beforeDenied = snapshot();
const denied = await post(1, first.id, outsiderOf(first), { setsA: 2, setsB: 0 });
const invalid = await post(0, first.id, anyPlayerOf(first), { setsA: 2, setsB: 2 });
const invalid2 = await post(0, first.id, anyPlayerOf(first), { setsA: 3, setsB: 0 });
const anonymous = await post(0, first.id, null, { setsA: 2, setsB: 0 });
check("permissões", "jogador de outra dupla recebe 403", denied.status === 403, `HTTP ${denied.status}`);
check("permissões", "placares inválidos (2x2, 3x0) recebem 400", invalid.status === 400 && invalid2.status === 400, `HTTP ${invalid.status}/${invalid2.status}`);
check("permissões", "sem sessão recebe 401", anonymous.status === 401);
check("permissões", "nenhuma das recusas gravou algo", snapshot() === beforeDenied);

// ---------- 3. fase de grupos: 21 jogos em ordem embaralhada, alternando instâncias ----------
const order = shuffle(groupMatches);
const seventhIndex = order.findIndex((m) => roundByPair.get(pairKey(m.teamAId, m.teamBId)) === 7);
order.unshift(...order.splice(seventhIndex, 1));
check("ordem livre", "Rodada 7 lançada antes de qualquer jogo da Rodada 1", roundByPair.get(pairKey(order[0].teamAId, order[0].teamBId)) === 7);
const favourite = (match) => (slotOf(match.teamAId) < slotOf(match.teamBId) ? match.teamAId : match.teamBId);
let groupFailures = 0; let simultaneous = 0; let retried = 0;
for (const [index, match] of order.entries()) {
  const instance = index % 2;
  const score = scoreFor(match, favourite(match), random() < 0.4 ? 1 : 0);
  if (index === 20) break; // o 21º tem tratamento próprio abaixo
  if (index % 5 === 2) {
    // Os dois parceiros (ou adversários) lançam o MESMO jogo ao mesmo tempo, um em cada instância.
    const other = scoreFor(match, favourite(match), score.setsA + score.setsB === 2 ? 1 : 0);
    const [a, b] = await Promise.all([post(0, match.id, membersOf(match.teamAId)[0], score), post(1, match.id, membersOf(match.teamBId)[1], other)]);
    const saved = (await call(0, "GET", "/api/matches?stage=grupos", ADMIN)).body.find((m) => m.id === match.id).result;
    const accepted = [a, b].filter((r) => r.status === 200).length;
    const coherent = [a, b].every((r) => [200, 409, 503].includes(r.status)) && accepted >= 1 && [score, other].some((s) => s.setsA === saved?.setsA && s.setsB === saved?.setsB) && auditCount(match.id) === accepted;
    if (!coherent) { groupFailures += 1; console.log("  simultâneo incoerente", a.status, b.status, saved, auditCount(match.id)); }
    ledger.set(match.id, saved);
    simultaneous += 1;
  } else {
    const response = await post(instance, match.id, anyPlayerOf(match), score);
    if (response.status !== 200) { groupFailures += 1; console.log("  falhou", response.status, response.body); }
    ledger.set(match.id, score);
    if (index % 7 === 3) {
      // Reenvio idêntico (o jogador clicou de novo / a resposta se perdeu): não duplica auditoria.
      const before = auditCount(match.id);
      const again = await post(1 - instance, match.id, anyPlayerOf(match), score);
      if (again.status !== 200 || auditCount(match.id) !== before) groupFailures += 1;
      retried += 1;
    }
  }
  await settled();
  if (!(await standingsMatch(`classificação após o jogo ${index + 1}`, index % 2))) groupFailures += 1;
}
check("fase de grupos", "20 jogos lançados em ordem embaralhada, alternando as duas instâncias", groupFailures === 0, `${simultaneous} lançamentos simultâneos do mesmo jogo, ${retried} reenvios idênticos`);
check("classificação", "classificação conferida por cálculo independente após cada um dos 20 jogos", groupFailures === 0);
check("mata-mata", "com 20 jogos não existe chaveamento nem jogo de mata-mata", (await bracket()).length === 0 && (await knockout()).length === 0);

// Correção de placar de grupo no meio da fase (muda pontos, recalcula).
{
  const target = order[4];
  const corrected = scoreFor(target, favourite(target), ledger.get(target.id).setsA + ledger.get(target.id).setsB === 2 ? 1 : 0);
  const response = await post(0, target.id, anyPlayerOf(target), corrected);
  ledger.set(target.id, corrected);
  await settled();
  check("correções", "corrigir placar de grupo recalcula a classificação", response.status === 200 && (await standingsMatch("classificação após correção")), `auditoria do jogo: ${auditCount(target.id)} linhas`);
}

// Cadeado fechado no meio da fase: jogador barrado; reabre.
{
  await call(1, "POST", "/api/admin/results-lock", ADMIN, { locked: true });
  const last = order[20];
  const blocked = await post(0, last.id, anyPlayerOf(last), scoreFor(last, favourite(last), 0));
  check("cadeado", "fechado no meio da fase: a outra instância recusa na hora", blocked.status === 403 && blocked.body.code === "results_locked");
  await call(0, "POST", "/api/admin/results-lock", ADMIN, { locked: false });
}

// O 21º jogo: enviado ao mesmo tempo pelas duas instâncias. O mata-mata nasce uma única vez.
{
  const last = order[20];
  const score = scoreFor(last, favourite(last), 0);
  const [a, b] = await Promise.all([post(0, last.id, membersOf(last.teamAId)[0], score), post(1, last.id, membersOf(last.teamBId)[0], score)]);
  ledger.set(last.id, score);
  const done = await settled();
  check("automação", "21º jogo enviado simultaneamente pelas duas instâncias é aceito sem erro inesperado", [a, b].every((r) => [200, 409, 503].includes(r.status)) && [a, b].some((r) => r.status === 200) && done, `HTTP ${a.status} / ${b.status}`);
  await standingsMatch("classificação final do grupo único");
  await integrity("quartas nascem sozinhas no 21º jogo: 6 confrontos e 2 jogos, sem duplicidade", 2);
  check("automação", "fase passou para Mata-mata sem ação do administrador", sql("select current_phase from public.truco_championships where status = 'em_andamento'") === "Mata-mata");
}
const seedAt = (position) => expectedStandings()[position - 1].teamId;
{
  const [q1, q2] = [await ko("Q1"), await ko("Q2")];
  check("regras", "quartas: 3º × 6º e 4º × 5º", q1.teamAId === seedAt(3) && q1.teamBId === seedAt(6) && q2.teamAId === seedAt(4) && q2.teamBId === seedAt(5));
  const inKnockout = new Set((await knockout()).flatMap((m) => [m.teamAId, m.teamBId]));
  check("regras", "1º e 2º esperam na semifinal; o 7º está fora do mata-mata", !inKnockout.has(seedAt(1)) && !inKnockout.has(seedAt(2)) && !inKnockout.has(seedAt(7)));
}

// Leituras não alteram nada: 40 GETs nas duas instâncias, 12 tabelas idênticas.
{
  const before = snapshot();
  for (let i = 0; i < 10; i += 1) await Promise.all([call(i % 2, "GET", "/api/bracket", ADMIN), call(i % 2, "GET", "/api/bracket/status", ADMIN), call(1 - (i % 2), "GET", "/api/matches", ADMIN), call(0, "GET", "/api/groups/A/standings", ADMIN)]);
  check("leituras", "40 consultas (chaveamento, status, jogos, classificação) não alteram nenhuma tabela", snapshot() === before);
}

// Correção de grupo que MUDA a classificação antes de qualquer placar de mata-mata: chaveamento refeito.
{
  const third = seedAt(3); const fourth = seedAt(4);
  const duel = groupMatches.find((m) => [m.teamAId, m.teamBId].includes(third) && [m.teamAId, m.teamBId].includes(fourth));
  const original = ledger.get(duel.id);
  const flipped = scoreFor(duel, winnerOf(duel, original) === third ? fourth : third, 0);
  const response = await post(1, duel.id, anyPlayerOf(duel), flipped);
  ledger.set(duel.id, flipped);
  await settled();
  const changed = seedAt(3) !== third || seedAt(4) !== fourth;
  const q1 = await ko("Q1");
  check("correções", "corrigir grupo antes do mata-mata começar refaz o chaveamento pela nova classificação", response.status === 200 && (await standingsMatch("classificação após inverter 3º/4º")) && q1.teamAId === seedAt(3), changed ? "3º e 4º mudaram" : "posições mantidas pelos critérios");
  await integrity("chaveamento refeito sem duplicar confrontos nem jogos", 2);
}

// ---------- 4. quartas ----------
const semiDirect = [seedAt(1), seedAt(2)];
let played = 21;
{
  const [q1, q2] = [await ko("Q1"), await ko("Q2")];
  const outsider = await post(0, q1.id, pick(membersOf(semiDirect[0])), scoreFor(q1, q1.teamAId, 0));
  check("permissões", "dupla que aguarda na semifinal não lança jogo das quartas (403)", outsider.status === 403);
  const eliminated = await post(1, q1.id, pick(membersOf(seedAt(7))), scoreFor(q1, q1.teamAId, 0));
  check("permissões", "7º colocado (eliminado) não lança jogo das quartas (403)", eliminated.status === 403);
  // As duas quartas ao mesmo tempo, uma em cada instância.
  const [a, b] = await Promise.all([post(0, q1.id, membersOf(q1.teamAId)[0], scoreFor(q1, q1.teamAId, 1)), post(1, q2.id, membersOf(q2.teamBId)[0], scoreFor(q2, q2.teamBId, 0))]);
  for (const [response, match, player, score] of [[a, q1, membersOf(q1.teamAId)[0], scoreFor(q1, q1.teamAId, 1)], [b, q2, membersOf(q2.teamBId)[0], scoreFor(q2, q2.teamBId, 0)]]) {
    if (response.status !== 200) { await settled(); const retry = await post(0, match.id, player, score); if (retry.status !== 200) console.log("  quartas não gravou", retry.status, retry.body); }
  }
  played += 2;
  const done = await settled();
  check("concorrência", "duas quartas lançadas ao mesmo tempo em instâncias diferentes", [a, b].every((r) => [200, 409, 503].includes(r.status)) && done, `HTTP ${a.status} / ${b.status}; conflito, quando ocorre, é resolvido reenviando`);
  await integrity("semifinais nascem sozinhas com as quartas encerradas (4 jogos)", 4);
  const [s1, s2] = [await ko("S1"), await ko("S2")];
  check("regras", "semifinais: 1º × vencedor da Quartas 2 e 2º × vencedor da Quartas 1", s1.teamAId === seedAt(1) && s1.teamBId === q2.teamBId && s2.teamAId === seedAt(2) && s2.teamBId === q1.teamAId);

  // Com placar no mata-mata, placar de grupo não muda mais — nem para o administrador.
  const anyGroup = groupMatches[3];
  const frozenPlayer = await post(0, anyGroup.id, anyPlayerOf(anyGroup), scoreFor(anyGroup, anyGroup.teamBId, 0));
  const frozenAdmin = await post(1, anyGroup.id, ADMIN, scoreFor(anyGroup, anyGroup.teamBId, 0));
  check("correções", "após o mata-mata começar, corrigir grupo é recusado (409) para jogador e administrador", frozenPlayer.status === 409 && frozenAdmin.status === 409, `HTTP ${frozenPlayer.status} / ${frozenAdmin.status}`);

  // Correção das quartas: mesmo vencedor (aceita) e vencedor trocado antes da semifinal (troca a dupla).
  const keep = await post(0, q1.id, membersOf(q1.teamBId)[0], scoreFor(q1, q1.teamAId, 0));
  await settled();
  check("correções", "corrigir placar das quartas mantendo o vencedor é aceito e não mexe na semifinal", keep.status === 200 && (await ko("S2")).id === s2.id && (await ko("S2")).teamBId === q1.teamAId);
  const flip = await post(1, q1.id, membersOf(q1.teamBId)[0], scoreFor(q1, q1.teamBId, 1));
  await settled();
  check("correções", "trocar o vencedor das quartas antes da semifinal troca a dupla da semifinal", flip.status === 200 && (await ko("S2")).teamBId === q1.teamBId);
  const back = await post(0, q1.id, membersOf(q1.teamAId)[0], scoreFor(q1, q1.teamAId, 1));
  await settled();
  check("correções", "corrigir de volta restaura a dupla original da semifinal", back.status === 200 && (await ko("S2")).teamBId === q1.teamAId);
  await integrity("semifinais sem duplicidade depois das correções", 4);
}

// ---------- 5. semifinais, com backend "caindo" depois de gravar o placar ----------
{
  const [s1, s2] = [await ko("S1"), await ko("S2")];
  // FALHA SIMULADA (escrita direta, só neste banco local): o placar é gravado pela RPC, como o
  // backend faz, mas o processo "morre" antes de avançar o mata-mata.
  const actor = sql(`select truco_id from public.truco_profiles where truco_player_id = '${membersOf(s1.teamAId)[0]}'`);
  const s1Score = scoreFor(s1, s1.teamAId, 1);
  sql(`set role service_role; select public.truco_rpc_record_match_result_v2((select truco_id from public.truco_championships where status = 'em_andamento'), '${s1.id}', ${s1Score.setsA}, ${s1Score.setsB}, '${actor}', (select progression_revision from public.truco_championships where status = 'em_andamento'))`);
  const wasPending = pending();
  const whilePending = await post(0, s2.id, membersOf(s2.teamAId)[0], scoreFor(s2, s2.teamAId, 0));
  if (wasPending && whilePending.status === 409) check("recuperação", "com avanço pendente, um jogo novo do mata-mata é recusado (409) até reconciliar", true, "placar gravado sem avanço; POST seguinte recusado");
  else untested("recuperação", "com avanço pendente, um jogo novo do mata-mata é recusado (409) até reconciliar", `o worker reconciliou antes da tentativa (HTTP ${whilePending.status})`);
  const recovered = await (async () => { for (let i = 0; i < 60 && pending(); i += 1) await sleep(250); return !pending(); })();
  check("recuperação", "worker conclui sozinho o avanço de um placar gravado sem avanço (até 15 s), sem reenvio", recovered);
  const b = whilePending.status === 200 ? whilePending : await post(1, s2.id, membersOf(s2.teamBId)[0], scoreFor(s2, s2.teamAId, 0));
  played += 2;
  await settled();
  check("automação", "semifinais encerradas: final e disputa de 3º lugar nascem sozinhas", b.status === 200);
  await integrity("final e 3º lugar criados (6 jogos)", 6);
  const [final, third] = [await ko("F"), await ko("T")];
  check("regras", "final entre os vencedores das semifinais", final.teamAId === s1.teamAId && final.teamBId === s2.teamAId);
  check("regras", "disputa de 3º lugar entre os perdedores das semifinais", third.teamAId === s1.teamBId && third.teamBId === s2.teamBId);
  const late = await post(0, s1.id, membersOf(s1.teamBId)[0], scoreFor(s1, s1.teamBId, 0));
  await settled();
  check("correções", "trocar o vencedor da semifinal antes da final troca o finalista E o semifinalista do 3º lugar", late.status === 200 && (await ko("F")).teamAId === s1.teamBId && (await ko("T")).teamAId === s1.teamAId);
  const back = await post(1, s1.id, membersOf(s1.teamAId)[0], s1Score);
  await settled();
  check("correções", "corrigir de volta restaura finalista e 3º lugar originais", back.status === 200 && (await ko("F")).teamAId === s1.teamAId && (await ko("T")).teamAId === s1.teamBId);
}

// ---------- 6. conexão perdida ----------
{
  // FALHA SIMULADA (só neste banco local): todas as conexões do backend são derrubadas.
  const killed = sql("select count(*) from (select pg_terminate_backend(pid) from pg_stat_activity where usename = 'truco_homologacao_runtime') k");
  const responses = [];
  for (let i = 0; i < 6; i += 1) responses.push((await call(i % 2, "GET", "/api/bracket/status", ADMIN)).status);
  const failures = responses.filter((code) => code !== 200);
  check("falhas temporárias", "conexões com o banco derrubadas: a API se recupera sozinha", responses.slice(-2).every((code) => code === 200) && failures.every((code) => code === 503), `${killed} conexões derrubadas; respostas: ${responses.join(", ")}`);
}

// ---------- 7. final, campeão e 3º lugar ----------
{
  const [final, third] = [await ko("F"), await ko("T")];
  check("permissões", "dupla da disputa de 3º lugar não lança a final (403)", (await post(0, final.id, membersOf(third.teamAId)[0], scoreFor(final, final.teamAId, 0))).status === 403);
  check("permissões", "finalista não lança a disputa de 3º lugar (403)", (await post(1, third.id, membersOf(final.teamBId)[0], scoreFor(third, third.teamAId, 0))).status === 403);
  const historyBefore = Number(sql("select count(*) from public.truco_history"));
  const score = scoreFor(final, final.teamAId, 1);
  // Os dois finalistas lançam ao mesmo tempo, em instâncias diferentes.
  const [a, b] = await Promise.all([post(0, final.id, membersOf(final.teamAId)[0], score), post(1, final.id, membersOf(final.teamBId)[0], score)]);
  played += 1;
  const done = await settled();
  check("concorrência", "final lançada ao mesmo tempo pelos dois finalistas em instâncias diferentes", [a, b].every((r) => [200, 409, 503].includes(r.status)) && [a, b].some((r) => r.status === 200) && done, `HTTP ${a.status} / ${b.status}`);
  const row = sql("select champion_team_id || '|' || runner_up_team_id || '|' || final_result || '|' || truco_championship_id from public.truco_history where edition = 5");
  check("campeão", "campeão registrado automaticamente e uma única vez no histórico, logo após a final", Number(sql("select count(*) from public.truco_history")) === historyBefore + 1 && Number(sql("select count(*) from public.truco_history where edition = 5")) === 1 && row.startsWith(`${final.teamAId}|${final.teamBId}|2x1|`), "truco_history: 1 linha da 5ª edição, campeão, vice e 2x1");
  const midStatus = (await call(1, "GET", "/api/bracket/status", ADMIN)).body;
  check("campeão", "com o 3º lugar pendente a edição continua aberta, mas o campeão já aparece", midStatus.editionFinished === false && midStatus.champion?.teamId === final.teamAId && sql("select current_phase from public.truco_championships where edition = 5") === "Mata-mata");

  // 3º lugar: lançado pela dupla perdedora, ao mesmo tempo que o vencedor tenta registrar.
  const thirdScore = scoreFor(third, third.teamBId, 1);
  const [c, d] = await Promise.all([post(0, third.id, membersOf(third.teamAId)[0], thirdScore), post(1, third.id, membersOf(third.teamBId)[1], thirdScore)]);
  played += 1;
  await settled();
  check("concorrência", "disputa de 3º lugar lançada ao mesmo tempo pelas duas duplas", [c, d].every((r) => [200, 403, 409, 503].includes(r.status)) && [c, d].some((r) => r.status === 200), `HTTP ${c.status} / ${d.status}`);
  const statusNow = (await call(1, "GET", "/api/bracket/status", ADMIN)).body;
  check("campeão", "edição encerrada sem ação do administrador quando final e 3º lugar têm placar", statusNow.editionFinished === true && statusNow.champion?.teamId === final.teamAId && sql("select current_phase from public.truco_championships where edition = 5") === "Campeonato Finalizado", `campeã: ${statusNow.champion?.teamName}`);
  const thirdRow = sql(`select case when sets_a > sets_b then truco_team_a_id else truco_team_b_id end from public.truco_matches where truco_id = '${third.id}'`);
  check("campeão", "3º lugar definido pelo jogo da disputa de 3º lugar", thirdRow === third.teamBId, `3º lugar: ${team(third.teamBId).name}`);
  check("campeão", "par histórico das duas finalistas preenchido (2 integrantes cada), sem tocar nos pares antigos", sql(`select string_agg(c::text, ',') from (select count(*) c from public.truco_team_members where truco_team_id in ('${final.teamAId}', '${final.teamBId}') group by truco_team_id) s`) === "2,2" && sql("select count(*) from public.truco_team_members where truco_team_id = homologacao.id('dupla-historica')") === "2");
  const hall = await fetch(INSTANCES[0] + "/rest/v1/truco_history").then((r) => r.json());
  check("campeão", "Hall da Fama (leitura pública, com RLS de anon) mostra a 5ª edição com os dois nomes", hall.length === 5 && hall[4].edition === 5 && hall[4].champion?.name === team(final.teamAId).name && hall[4].champion.truco_team_members.length === 2);
  const major = (await call(0, "GET", "/api/history/major-champions", membersOf(final.teamAId)[0])).body;
  check("campeão", "Maiores Campeões inclui o título novo", Array.isArray(major) && JSON.stringify(major).includes(team(final.teamAId).name.split(" & ")[0]));
  check("campeão", "histórico das edições 1 a 4 intacto", sql("select string_agg(edition || ':' || champion_team_id, ',' order by edition) from public.truco_history where edition < 5") === sql("select string_agg(n || ':' || homologacao.id((array['dupla-a1','dupla-a1','dupla-historica','dupla-a2'])[n]), ',' order by n) from generate_series(1,4) n"));
  const afterEnd = await post(0, final.id, membersOf(final.teamBId)[0], scoreFor(final, final.teamBId, 0));
  const thirdAfterEnd = await post(0, third.id, membersOf(third.teamAId)[0], scoreFor(third, third.teamAId, 0));
  const groupAfterEnd = await post(1, groupMatches[0].id, anyPlayerOf(groupMatches[0]), { setsA: 2, setsB: 0 });
  check("campeão", "depois do encerramento, jogador não lança nem edita nada (403)", afterEnd.status === 403 && thirdAfterEnd.status === 403 && groupAfterEnd.status === 403, `HTTP ${afterEnd.status} / ${thirdAfterEnd.status} / ${groupAfterEnd.status}`);
  const frozen = snapshot();
  await sleep(6000); // um ciclo do worker
  check("campeão", "estado final estável: nada muda depois do encerramento (um ciclo do worker)", snapshot() === frozen && !pending());
}

// ---------- fechamento ----------
const scored = Number(sql("select count(*) from public.truco_matches where sets_a is not null and truco_championship_id = (select truco_id from public.truco_championships where edition = 5)"));
check("campeonato", "27 partidas com placar: 21 do grupo + 2 quartas + 2 semifinais + 3º lugar + final", played === 27 && scored === 27 && sql("select string_agg(round || '=' || c, ', ' order by round) from (select case when stage = 'grupos' then 'Grupos' else round end as round, count(*) c from public.truco_matches where sets_a is not null group by 1) s") === "Disputa de 3º lugar=1, Final=1, Grupos=21, Quartas de final=2, Semifinal=2", `${scored} jogos com placar no banco`);
check("campeonato", "todo placar gravado tem auditoria com autor", sql("select count(*) from public.truco_matches m where sets_a is not null and not exists (select 1 from public.truco_audit_log a where a.entity = 'match_result' and a.entity_id = m.truco_id and a.truco_actor_id is not null)") === "0");
const noise = sql("select count(*) filter (where entity = 'truco_championships' and action = 'update') || ' de ' || count(*) from public.truco_audit_log");
console.log(`\nAuditoria: ${noise} linhas são atualizações de truco_championships (ruído do contador de revisão).`);

const summary = { seed: seedArg, total: results.length, passou: results.filter((r) => r.status === "PASSOU").length, falhou: results.filter((r) => r.status === "FALHOU").length, naoTestado: results.filter((r) => r.status === "NÃO TESTADO").length, auditNoise: noise, results };
if (!process.argv.includes("--text-only")) {
  mkdirSync(join(root, "test-results", "homologacao-api"), { recursive: true });
  writeFileSync(join(root, "test-results", "homologacao-api", `relatorio-${seedArg}.json`), JSON.stringify(summary, null, 2));
}
console.log(`\nResumo (semente ${seedArg}): ${summary.passou} PASSOU, ${summary.falhou} FALHOU, ${summary.naoTestado} NÃO TESTADO`);
process.exit(summary.falhou === 0 ? 0 : 1);
