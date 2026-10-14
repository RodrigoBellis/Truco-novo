// Ensaio LOCAL da troca de participantes da 5ª edição (formato de 14/10/2026: 7 duplas, grupo único).
//
//   node backend/scripts/homologacao-participantes.mjs [--api http://127.0.0.1:3101]
//
// 1. Recria no PostgreSQL local o retrato de identidades do oficial (homologacao.retrato_oficial).
// 2. Roda supabase/scripts/edition5_replace_participants.sql em modo ensaio (tem de desfazer tudo)
//    e depois gravando, e confere: nada duplicado, Rafael virou Rafinha com o mesmo id e a mesma
//    conta, Digão é outra pessoa, Hall da Fama e pares históricos idênticos.
// 3. Acessos: as 11 contas existentes começam com a senha antiga de cada jogador; os 3 novos sem conta.
// 4. Com --api (backend em modo homologação rodando): "Reiniciar acesso de todos" (só com o cadeado
//    fechado), os 14 sem senha válida e com as sessões antigas recusadas, os 14 criam a própria senha
//    na carta, cadastro único e atômico, logout/refresh, "Redefinir acesso", limite de tentativas,
//    auditoria sem senha, consulta com o cadeado fechado e permissão só sobre a própria dupla.
//    Nenhuma senha é escrita no terminal nem em arquivo.
//
// Só fala com 127.0.0.1:55450. Não lê .env, não usa chave nem URL do Supabase.
import { randomBytes, randomInt, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pg = createRequire(join(root, "backend", "package.json"))("pg");
const apiIndex = process.argv.indexOf("--api");
const API = apiIndex > 0 ? process.argv[apiIndex + 1] ?? "http://127.0.0.1:3101" : null;
if (API && !/^http:\/\/127\.0\.0\.1:\d+$/.test(API)) throw new Error("--api só aceita http://127.0.0.1:<porta>");

const OFICIAL = [
  ["Pigas", "Diguinho", 4], ["Ronaldo", "Rodrigo", 5], ["JP", "Anderson", 3], ["Saulo", "Vitor", 3],
  ["PG", "Alexandre", 2], ["Rogério", "Waguinho", 2], ["Digão", "Rafinha", 2],
];
const PARTICIPANTES = OFICIAL.flatMap(([a, b]) => [a, b]);
const SAEM = ["Bagriel", "Bitula", "Galão", "Caio", "Vito", "Luizão", "Xablauu", "Davi", "Fernando"];
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const temporaryPassword = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const hashPassword = (password) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64url")}$${scryptSync(password, salt, 32).toString("base64url")}`;
};
const slug = (name) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const db = new pg.Client({ host: "127.0.0.1", port: 55450, user: "postgres", database: "truco_homologacao" });
await db.connect();
const q = async (text, params = []) => (await db.query(text, params)).rows;
const results = [];
const check = (label, fn) => { try { fn(); results.push(["PASSOU", label]); } catch (error) { results.push(["FALHOU", label + " — " + error.message.split("\n")[0]]); } };

const [{ marcador }] = await q("select count(*)::int as marcador from homologacao.ambiente where nome = 'truco-homologacao-local'");
assert.equal(marcador, 1, "banco não é o de homologação local");

// ---------- 1. Retrato ----------
await q("select homologacao.retrato_oficial()");
const fingerprint = async () => (await q(`select
  (select string_agg(edition || ':' || coalesce(champion_team_id::text, '-') || ':' || coalesce(runner_up_team_id::text, '-'), ',' order by edition) from public.truco_history) as history,
  (select md5(string_agg(truco_team_id::text || truco_player_id::text || position, ',' order by truco_team_id, position)) from public.truco_team_members) as members,
  (select md5(string_agg(truco_id::text || truco_player_id::text || role || email, ',' order by truco_id)) from public.truco_profiles) as profiles,
  (select md5(string_agg(truco_id::text || name, ',' order by truco_id)) from public.truco_players) as players,
  (select md5(string_agg(truco_id::text || name || status || coalesce(truco_group_id::text, '-'), ',' order by truco_id)) from public.truco_teams) as teams,
  (select count(*)::int from public.truco_team_memberships) as memberships`))[0];
const before = await fingerprint();
const [rafael] = await q("select p.truco_id, pr.truco_id as conta from public.truco_players p join public.truco_profiles pr on pr.truco_player_id = p.truco_id where p.name = 'Rafael'");
const [diguinho] = await q("select truco_id from public.truco_players where name = 'Diguinho'");

// ---------- 2. Troca de participantes ----------
const script = readFileSync(join(root, "supabase", "scripts", "edition5_replace_participants.sql"), "utf8");
let ensaioMessage = "";
try { await db.query(script); } catch (error) { ensaioMessage = error.message; }
check("modo ensaio do script desfaz tudo e lista as 7 duplas", () => {
  assert.match(ensaioMessage, /^ENSAIO \(nada foi gravado\)/);
  for (const [a, b] of OFICIAL) assert.ok(ensaioMessage.includes(`${a} & ${b}`), `${a} & ${b} fora do ensaio`);
});
const afterEnsaio = await fingerprint();
check("depois do ensaio o banco está idêntico ao retrato", () => assert.deepEqual(afterEnsaio, before));
const gravando = script.replace("v_ensaio constant boolean := true;", "v_ensaio constant boolean := false;");
assert.notEqual(gravando, script);
await db.query(gravando);
const after = await fingerprint();

const roster = await q(`select pl.name, t.name as dupla, g.label as grupo, m.strength, t.status
  from public.truco_team_memberships m
  join public.truco_championships c on c.truco_id = m.truco_championship_id and c.edition = 5
  join public.truco_teams t on t.truco_id = m.truco_team_id
  left join public.truco_groups g on g.truco_id = t.truco_group_id
  join public.truco_players pl on pl.truco_id in (m.truco_player_1_id, m.truco_player_2_id)`);
check("14 participantes, cada um na dupla, força e grupo único corretos", () => {
  assert.equal(roster.length, 14);
  for (const [a, b, strength] of OFICIAL) for (const name of [a, b]) {
    const row = roster.find((item) => item.name === name);
    assert.ok(row, `${name} sem dupla`);
    assert.deepEqual([row.dupla, row.grupo, row.strength, row.status], [`${a} & ${b}`, "A", strength, "aprovada"], name);
  }
});
check("Hall da Fama e pares históricos idênticos (4 edições)", () => assert.deepEqual([after.history, after.members], [before.history, before.members]));
check("nenhuma conta criada, apagada ou trocada pelo script", () => assert.equal(after.profiles, before.profiles));
const [rafinha] = await q("select p.truco_id, pr.truco_id as conta from public.truco_players p join public.truco_profiles pr on pr.truco_player_id = p.truco_id where p.name = 'Rafinha'");
const [{ n: rafaelLeft }] = await q("select count(*)::int as n from public.truco_players where name = 'Rafael'");
check("Rafinha é o antigo Rafael: mesmo jogador, mesma conta; não sobrou nenhum 'Rafael'", () => {
  assert.deepEqual([rafinha.truco_id, rafinha.conta], [rafael.truco_id, rafael.conta]);
  assert.equal(rafaelLeft, 0);
});
const [digao] = await q("select truco_id from public.truco_players where name = 'Digão'");
check("Digão é um jogador novo, diferente do Diguinho", () => assert.ok(digao && digao.truco_id !== diguinho.truco_id));
const dupNames = await q("select lower(name) as name, count(*)::int as n from public.truco_players group by lower(name) having count(*) > 1");
check("nenhum nome de jogador duplicado", () => assert.deepEqual(dupNames, []));
const leaving = await q(`select p.name, (select count(*)::int from public.truco_profiles pr where pr.truco_player_id = p.truco_id) as contas
  from public.truco_players p where p.name = any($1)`, [SAEM]);
check("participantes antigos continuam cadastrados, com conta, mas fora da edição", () => {
  assert.equal(leaving.length, SAEM.length);
  assert.ok(leaving.every((row) => row.contas === 1));
  assert.ok(leaving.every((row) => !roster.some((item) => item.name === row.name)));
});
const champions = await q(`select h.edition, string_agg(p.name, ' & ' order by tm.position) as dupla from public.truco_history h
  join public.truco_team_members tm on tm.truco_team_id = h.champion_team_id join public.truco_players p on p.truco_id = tm.truco_player_id group by h.edition order by h.edition`);
check("títulos preservados: 1ª e 2ª Bagriel & Diguinho, 3ª Bitula & Vinícius, 4ª Ronaldo & Rodrigo", () => assert.deepEqual(champions.map((row) => row.dupla),
  ["Bagriel & Diguinho", "Bagriel & Diguinho", "Bitula & Vinícius", "Ronaldo & Rodrigo"]));

// ---------- 3. Acessos: antes do reinício, cada conta existente tem a senha que o jogador usa ----------
// Simula o oficial de hoje: as 11 contas existentes têm senhas pessoais (sorteadas aqui, só na
// memória deste processo; no banco fica só o hash). Os 3 novos ainda não têm conta.
const accounts = [];
for (const name of PARTICIPANTES) {
  const [player] = await q("select truco_id from public.truco_players where name = $1", [name]);
  const [profile] = await q("select truco_id from public.truco_profiles where truco_player_id = $1", [player.truco_id]);
  const account = { name, playerId: player.truco_id, hadAccount: Boolean(profile), oldPassword: null, password: null, token: null };
  if (profile) {
    account.oldPassword = temporaryPassword() + "-antiga";
    await q("insert into homologacao.credencial (truco_id, hash) values ($1, $2) on conflict (truco_id) do update set hash = excluded.hash", [profile.truco_id, hashPassword(account.oldPassword)]);
  }
  accounts.push(account);
}
check("antes do reinício: 11 contas com senha antiga e 3 jogadores novos sem conta", () => {
  assert.deepEqual(accounts.filter((account) => !account.hadAccount).map((account) => account.name).sort(), ["Anderson", "Digão", "Saulo"]);
});

// ---------- 4. API ----------
if (API) {
  const call = async (method, path, token, body) => {
    const response = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const login = (account, password = account.password) => call("POST", "/api/auth/login", null, { playerId: account.playerId, password });
  const create = (account, password) => call("POST", "/api/auth/first-access", null, { playerId: account.playerId, newPassword: password });
  const byName = (name) => accounts.find((account) => account.name === name);
  const roster = async () => (await call("GET", "/api/players/roster")).body;
  const admin = (await call("POST", "/api/auth/login", null, { email: "admin@trucodonovo.com", password: "ensaio-2026" })).body.token;

  // Sessões abertas antes do reinício (com a senha antiga).
  const oldSessions = new Map();
  for (const account of accounts.filter((item) => item.hadAccount)) oldSessions.set(account.name, (await login(account, account.oldPassword)).body.token);
  check("antes do reinício as 11 contas existentes entram com a senha antiga", () => assert.ok([...oldSessions.values()].every(Boolean)));

  // a) Reinício do acesso dos 14: recusado com o cadeado aberto; feito com o cadeado fechado.
  await call("POST", "/api/admin/results-lock", admin, { locked: false });
  const refusedOpen = await call("POST", "/api/admin/access/restart", admin);
  await call("POST", "/api/admin/results-lock", admin, { locked: true });
  const playerRestart = await call("POST", "/api/admin/access/restart", oldSessions.get("Pigas"));
  const restart = await call("POST", "/api/admin/access/restart", admin);
  check("reinício dos 14: só o administrador, só com o cadeado fechado", () => {
    assert.deepEqual([refusedOpen.status, refusedOpen.body.code, playerRestart.status], [409, "results_open", 403]);
    assert.deepEqual([restart.status, restart.body.restarted, restart.body.created], [200, 14, 3]);
  });

  // b) Os 14 começam sem senha válida.
  const afterRestart = await roster();
  let oldRefused = true;
  for (const account of accounts.filter((item) => item.hadAccount)) if ((await login(account, account.oldPassword)).status === 200) oldRefused = false;
  const oldSessionReplies = await Promise.all([...oldSessions.values()].map((token) => call("GET", "/api/teams", token)));
  check("os 14 iniciam aguardando a criação de senha (a carta de cada um leva a \"Crie sua senha\")", () => {
    assert.equal(afterRestart.length, 14);
    assert.ok(afterRestart.every((player) => player.needsSetup === true));
  });
  check("nenhuma senha antiga continua válida", () => assert.ok(oldRefused));
  check("sessões abertas antes do reinício são recusadas pela API (401)", () => assert.ok(oldSessionReplies.every((reply) => reply.status === 401)));
  const status = (await call("GET", "/api/admin/players/access", admin)).body;
  check("Admin → Jogadores: 0 de 14 com senha criada, sem nenhuma senha na resposta", () => {
    assert.equal(accounts.filter((account) => status.find((row) => row.playerId === account.playerId)?.setupPending === true).length, 14);
    assert.ok(!JSON.stringify(status).includes("antiga"));
  });

  // c) Os 14 criam a própria senha ao mesmo tempo.
  for (const account of accounts) account.password = temporaryPassword() + "-minha";
  const created = await Promise.all(accounts.map((account) => create(account, account.password)));
  check("os 14 criam a própria senha (ao mesmo tempo, sem trocar identidades) e já entram", () => created.forEach((reply, index) => {
    assert.equal(reply.status, 200, accounts[index].name + " " + JSON.stringify(reply.body));
    assert.deepEqual([reply.body.user.name, reply.body.user.playerId, reply.body.user.mustChangePassword], [accounts[index].name, accounts[index].playerId, false]);
  }));
  created.forEach((reply, index) => { accounts[index].token = reply.body.token; accounts[index].refresh = reply.body.refreshToken; });
  const teamsWithNew = await Promise.all(accounts.map((account) => call("GET", "/api/teams", account.token)));
  check("a sessão aberta na criação da senha vale na API", () => assert.ok(teamsWithNew.every((reply) => reply.status === 200)));

  // d) O primeiro cadastro não pode ser repetido.
  const again = await create(byName("Pigas"), "tentando-de-novo");
  const stillOwn = await login(byName("Pigas"));
  check("criar a senha de novo é recusado (409) e a senha do jogador continua a mesma", () => {
    assert.deepEqual([again.status, again.body.code, stillOwn.status], [409, "already_configured", 200]);
  });
  const finalRoster = await roster();
  check("a tela de entrada passa a pedir a senha para os 14", () => assert.ok(finalRoster.every((player) => player.needsSetup === false)));

  // e) Logout e refresh: a senha criada continua valendo; a renovação da sessão também.
  let afterLogout = true;
  for (const account of accounts) if ((await login(account)).status !== 200) afterLogout = false;
  const refreshed = await fetch(API + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: byName("Digão").refresh }) }).then((r) => r.json());
  const refreshedUse = await call("GET", "/api/teams", refreshed.access_token);
  check("a senha criada funciona depois de sair e entrar de novo; a sessão renovada continua válida", () => assert.deepEqual([afterLogout, refreshedUse.status], [true, 200]));

  // f) Esqueceu a senha (ou outra pessoa criou no lugar dele): "Redefinir acesso".
  const digao = byName("Digão");
  const diguinho = byName("Diguinho");
  const intrude = await Promise.all([
    call("POST", `/api/admin/players/${diguinho.playerId}/reset-access`, digao.token),
    call("POST", `/api/admin/players/${digao.playerId}/reset-access`, digao.token),
    call("GET", "/api/admin/players/access", digao.token),
    call("POST", `/api/admin/players/${digao.playerId}/reset-access`, null),
  ]);
  check("jogador não redefine o acesso de outro (Digão × Diguinho), nem o próprio; sem sessão é 401", () => assert.deepEqual(intrude.map((reply) => reply.status), [403, 403, 403, 401]));
  const reset = await call("POST", `/api/admin/players/${digao.playerId}/reset-access`, admin);
  const revokedSession = await call("GET", "/api/teams", digao.token);
  const revokedRefresh = await call("GET", "/api/teams", refreshed.access_token);
  const passwordGone = await login(digao);
  const rosterAfterReset = await roster();
  check("Redefinir acesso: senha e sessões (inclusive renovadas) do jogador caem, e ele volta a \"Aguardando criação de senha\"", () => {
    assert.deepEqual([reset.status, revokedSession.status, revokedRefresh.status, passwordGone.status], [200, 401, 401, 400]);
    assert.equal(rosterAfterReset.find((player) => player.id === digao.playerId).needsSetup, true);
    assert.ok(rosterAfterReset.filter((player) => player.id !== digao.playerId).every((player) => player.needsSetup === false), "os outros 13 não foram afetados");
  });
  const others = await Promise.all(accounts.filter((account) => account !== digao).map((account) => call("GET", "/api/teams", account.token)));
  check("as outras 13 sessões continuam válidas depois da redefinição de um jogador", () => assert.ok(others.every((reply) => reply.status === 200)));

  // g) Cadastro simultâneo da mesma carta: só uma senha vence.
  const [first, second] = await Promise.all([create(digao, "senha-do-digao"), create(digao, "senha-do-intruso")]);
  const winner = first.status === 200 ? "senha-do-digao" : "senha-do-intruso";
  const loser = winner === "senha-do-digao" ? "senha-do-intruso" : "senha-do-digao";
  const winnerLogin = await login(digao, winner);
  const loserLogin = await login(digao, loser);
  check("duas pessoas criando a senha da mesma carta ao mesmo tempo: só uma grava, a outra recebe 409", () => {
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
    assert.deepEqual([winnerLogin.status, loserLogin.status], [200, 400]);
  });
  digao.password = winner;
  digao.token = winnerLogin.body.token;

  // h) Tentativas excessivas.
  const flood = [];
  for (let index = 0; index < 7; index += 1) flood.push((await create(diguinho, "qualquer-coisa")).status);
  // Diguinho já usou 1 tentativa (a criação da senha): sobram 4 no limite de 5 em 10 minutos.
  check("tentativas excessivas de criar senha na mesma carta são barradas (429)", () => {
    assert.deepEqual(flood, [409, 409, 409, 409, 429, 429, 429]);
  });
  const shortPassword = await call("POST", "/api/admin/players/" + byName("Saulo").playerId + "/reset-access", admin).then(() => create(byName("Saulo"), "123"));
  check("senha curta é recusada na criação (400)", () => assert.equal(shortPassword.status, 400));
  byName("Saulo").password = "saulo-recriada";
  const sauloAgain = await create(byName("Saulo"), byName("Saulo").password);
  byName("Saulo").token = sauloAgain.body?.token;

  // i) Auditoria e armazenamento.
  const audit = await q("select action, truco_actor_id::text as actor, metadata::text from public.truco_audit_log where action like 'access_%' order by created_at");
  check("auditoria registra reinício, criações de acesso, senhas criadas e redefinições, sem nenhuma senha", () => {
    const actions = audit.map((row) => row.action);
    assert.equal(actions.filter((action) => action === "access_restart_all").length, 1);
    assert.equal(actions.filter((action) => action === "access_setup_completed").length, 16, "14 + Digão de novo + Saulo de novo");
    assert.equal(actions.filter((action) => action === "access_reset").length, 2);
    assert.ok(audit.every((row) => row.actor));
    const text = JSON.stringify(audit);
    for (const account of accounts) for (const secret of [account.password, account.oldPassword].filter(Boolean)) assert.ok(!text.includes(secret), account.name);
    assert.ok(!text.includes("senha-do-intruso") && !text.includes("senha-do-digao"));
  });
  const [{ plain }] = await q("select count(*)::int as plain from homologacao.credencial where hash not like 'scrypt$%'");
  check("o banco guarda só hashes: nenhuma senha em texto", () => assert.equal(plain, 0));

  // j) Publicado com o cadeado fechado: todos consultam, ninguém lança resultado.
  const teams = (await call("GET", "/api/teams", byName("Pigas").token)).body;
  check("cada jogador vinculado à dupla correta (vista pela API)", () => {
    for (const [a, b, strength] of OFICIAL) {
      const row = teams.find((item) => item.name === `${a} & ${b}` && item.status === "aprovada");
      assert.ok(row, `${a} & ${b}`);
      assert.deepEqual([row.groupId, row.strength], ["A", strength]);
    }
  });
  const generated = await call("POST", "/api/groups/generate-matches", admin);
  check("administrador gera os 21 jogos do grupo único", () => assert.deepEqual([generated.status, generated.body.matchesCreated], [201, 21]));
  const matches = (await call("GET", "/api/matches?stage=grupos", admin)).body;
  const teamOf = new Map(teams.map((item) => [item.id, item.name]));
  const ownMatch = (account) => matches.find((match) => [teamOf.get(match.teamAId), teamOf.get(match.teamBId)].some((name) => name?.split(" & ").includes(account.name)));
  const lockedReplies = await Promise.all(accounts.map(async (account) => {
    const token = (await login(account)).body.token;
    const reads = await Promise.all(["/api/teams", "/api/groups/A/standings", "/api/matches", "/api/bracket"].map((path) => call("GET", path, token)));
    const post = await call("POST", `/api/matches/${ownMatch(account).id}/result`, token, { setsA: 2, setsB: 0 });
    return { reads: reads.map((reply) => reply.status), post: [post.status, post.body?.code] };
  }));
  check("com o cadeado fechado os 14 consultam dupla, grupo, jogos e chaveamento, mas não lançam resultado", () => lockedReplies.forEach((reply, index) => {
    assert.deepEqual(reply.reads, [200, 200, 200, 200], accounts[index].name);
    assert.deepEqual(reply.post, [403, "results_locked"], accounts[index].name);
  }));
  await call("POST", "/api/admin/results-lock", admin, { locked: false });
  let ownOk = true;
  let othersRefused = true;
  for (const account of accounts) {
    const token = (await login(account)).body.token;
    const teamName = teams.find((item) => item.status === "aprovada" && item.name.split(" & ").includes(account.name)).name;
    const own = matches.find((match) => [teamOf.get(match.teamAId), teamOf.get(match.teamBId)].includes(teamName));
    const foreign = matches.find((match) => ![teamOf.get(match.teamAId), teamOf.get(match.teamBId)].includes(teamName));
    if ((await call("POST", `/api/matches/${own.id}/result`, token, { setsA: 2, setsB: 1 })).status !== 200) ownOk = false;
    if ((await call("POST", `/api/matches/${own.id}/result`, token, { setsA: 1, setsB: 2 })).status !== 200) ownOk = false;
    if ((await call("POST", `/api/matches/${foreign.id}/result`, token, { setsA: 2, setsB: 0 })).status !== 403) othersRefused = false;
  }
  check("com o cadeado aberto, cada um dos 14 lança e edita placar da própria dupla", () => assert.ok(ownOk));
  check("nenhum dos 14 consegue lançar ou editar placar de outra dupla (403)", () => assert.ok(othersRefused));
  const former = await roster();
  check("participantes antigos não aparecem no login desta edição", () => assert.ok(!former.some((row) => SAEM.includes(row.name) || row.name === "Rafael")));
}

// ---------- Relatório (sem senhas) ----------
const report = await q(`select p.name as jogador, t.name as dupla, m.strength as forca, pr.access_setup_required as pendente
  from public.truco_team_memberships m join public.truco_teams t on t.truco_id = m.truco_team_id
  join public.truco_players p on p.truco_id in (m.truco_player_1_id, m.truco_player_2_id)
  left join public.truco_profiles pr on pr.truco_player_id = p.truco_id order by m.strength desc, t.name, p.name`);
console.log("\nJogador | Dupla | Força | Acesso");
for (const row of report) {
  const account = accounts.find((item) => item.name === row.jogador);
  console.log(`${row.jogador} | ${row.dupla} | ${"★".repeat(row.forca)} | ${account.hadAccount ? "conta existente" : "conta criada no reinício"}; ${row.pendente === false ? "senha criada pelo próprio jogador" : row.pendente === true ? "aguardando criação de senha" : "sem conta"}`);
}
console.log("\nVerificações:");
for (const [state, label] of results) console.log(`${state}  ${label}`);
await db.end();
process.exitCode = results.some(([state]) => state !== "PASSOU") ? 1 : 0;
