// Campeonato completo na homologação LOCAL (PostgreSQL + API real), conduzido pelas 3 mesas.
//
//   node backend/scripts/homologacao-local.mjs up
//   npm run dev:homologacao --workspace backend          (porta 3101)
//   node backend/scripts/homologacao-mesas-api.mjs [semente]
//
// 1. Reset (14 jogadores fictícios, 7 duplas, 21 jogos) e "Reiniciar acesso de todos": os 14
//    criam a própria senha e entram.
// 2. Cadeado fechado: ninguém lança. Administrador abre.
// 3. Fase de grupos pelas 3 mesas: cada mesa livre recebe a sugestão do motor (suggestNextMatches);
//    jogos duram de 15 a 45 min (relógio simulado); quando vários terminam no mesmo minuto, os
//    placares são lançados AO MESMO TEMPO por jogadores diferentes. Correções e tentativas de
//    intrusos no meio. Classificação conferida por cálculo independente após cada lote.
// 4. Mata-mata pelas mesas: quartas juntas, semifinais juntas, final e 3º lugar juntos.
// 5. Campeão, vice, 3º e 4º; edição encerrada; histórico 1–4 intacto.
// Só fala com 127.0.0.1. Nenhuma senha é escrita no terminal.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { suggestNextMatches } = await import(pathToFileURL(join(root, "shared", "dist", "index.js")).href);
const API = "http://127.0.0.1:3101";
const seedArg = Number(process.argv.slice(2).find((arg) => /^\d+$/.test(arg)) ?? 20261025);
const TOGETHER = process.argv.includes("--juntos");
const pgBin = [process.env.PG_BIN, ...["18", "17", "16", "15"].map((v) => `C:/Program Files/PostgreSQL/${v}/bin`)].filter(Boolean).find((dir) => existsSync(join(dir, "psql.exe")) || existsSync(join(dir, "psql")));
const sql = (query) => execFileSync(join(pgBin, "psql"), ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", "55450", "-U", "postgres", "-d", "truco_homologacao", "-c", query], { encoding: "utf8", env: { ...process.env, PGCLIENTENCODING: "UTF8" } }).trim();

let state = seedArg >>> 0;
const random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (list) => list[Math.floor(random() * list.length)];
const SCORES = [{ setsA: 2, setsB: 0 }, { setsA: 2, setsB: 1 }, { setsA: 1, setsB: 2 }, { setsA: 0, setsB: 2 }];

const results = [];
const check = (area, name, ok, evidence = "") => { results.push({ area, name, ok }); console.log(`${ok ? "PASSOU " : "FALHOU "} [${area}] ${name}${evidence ? " — " + evidence : ""}`); };
async function call(method, path, token, body) {
  const response = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

// ---------- 1. Preparação e acesso ----------
check("isolamento", "banco conferido é o local de homologação", sql("select nome from homologacao.ambiente") === "truco-homologacao-local");
check("preparação", "reset da homologação", (await call("POST", "/api/rehearsal/reset")).status === 204);
const status = (await call("GET", "/api/rehearsal/status")).body;
const admin = (await call("POST", "/api/auth/login", null, { email: "admin@trucodonovo.com", password: status.password })).body.token;
const historyBefore = sql("select string_agg(edition || ':' || champion_team_id, ',' order by edition) from public.truco_history");
const restart = await call("POST", "/api/admin/access/restart", admin);
check("acesso", "administrador reinicia o acesso dos 14 com o cadeado fechado", restart.status === 200 && restart.body.restarted === 14);
const players = status.accounts.filter((account) => account.role === "jogador");
const tokens = new Map();
const created = await Promise.all(players.map((player) => call("POST", "/api/auth/first-access", null, { playerId: player.playerId, newPassword: randomBytes(9).toString("base64url") })));
created.forEach((reply, index) => tokens.set(players[index].playerId, reply.body?.token));
check("acesso", "os 14 criam a própria senha ao mesmo tempo e entram com a conta certa", created.every((reply, index) => reply.status === 200 && reply.body.user.playerId === players[index].playerId));

const teams = (await call("GET", "/api/teams", admin)).body;
let groupMatches = (await call("GET", "/api/matches?stage=grupos", admin)).body;
check("preparação", "7 duplas no grupo único e 21 jogos", teams.length === 7 && groupMatches.length === 21 && new Set(groupMatches.map((m) => [m.teamAId, m.teamBId].sort().join())).size === 21);
const team = (id) => teams.find((item) => item.id === id);
const members = (teamId) => [team(teamId).player1Id, team(teamId).player2Id];
const playerOf = (match) => pick([...members(match.teamAId), ...members(match.teamBId)]);
const outsiderOf = (match) => pick(teams.filter((t) => t.id !== match.teamAId && t.id !== match.teamBId).flatMap((t) => members(t.id)));

// ---------- 2. Cadeado ----------
const lockedTry = await call("POST", `/api/matches/${groupMatches[0].id}/result`, tokens.get(playerOf(groupMatches[0])), SCORES[0]);
check("cadeado", "fechado: jogador recebe 403 results_locked e nada é gravado", lockedTry.status === 403 && lockedTry.body.code === "results_locked" && sql("select count(*) from public.truco_matches where sets_a is not null") === "0");
check("cadeado", "administrador abre o cadeado", (await call("POST", "/api/admin/results-lock", admin, { locked: false })).status === 200);

// ---------- 3. Fase de grupos pelas 3 mesas ----------
const ledger = new Map();
function expectedOrder() {
  const rows = teams.map((t) => ({ id: t.id, pts: 0, v: 0, x20: 0, saldo: 0 }));
  const played = groupMatches.filter((m) => ledger.has(m.id));
  for (const m of played) {
    const s = ledger.get(m.id);
    for (const [id, mine, theirs] of [[m.teamAId, s.setsA, s.setsB], [m.teamBId, s.setsB, s.setsA]]) {
      const row = rows.find((r) => r.id === id);
      row.saldo += mine - theirs;
      if (mine > theirs) { row.v += 1; row.pts += theirs === 0 ? 3 : 2; if (theirs === 0) row.x20 += 1; } else row.pts += mine === 1 ? 1 : 0;
    }
  }
  const key = (r) => `${r.pts}/${r.v}/${r.x20}`;
  const direct = (r, tied) => played.filter((m) => tied.includes(m.teamAId) && tied.includes(m.teamBId) && (ledger.get(m.id).setsA > ledger.get(m.id).setsB ? m.teamAId : m.teamBId) === r.id).length;
  return rows.sort((a, b) => {
    if (key(a) !== key(b)) return b.pts - a.pts || b.v - a.v || b.x20 - a.x20;
    const tied = rows.filter((r) => key(r) === key(a)).map((r) => r.id);
    return direct(b, tied) - direct(a, tied) || b.saldo - a.saldo;
  }).map((r) => ({ id: r.id, pts: r.pts }));
}
async function standingsOk() {
  const rows = (await call("GET", "/api/groups/A/standings", admin)).body;
  const expected = expectedOrder();
  // Empate exato fica pendente: compara pontos por dupla sempre; a ordem só onde não há empate pendente.
  const ptsOk = expected.every((row) => rows.find((r) => r.teamId === row.id)?.pontos === row.pts);
  const orderOk = rows.some((r) => r.tiePending) || JSON.stringify([...rows].sort((a, b) => a.position - b.position).map((r) => r.teamId)) === JSON.stringify(expected.map((r) => r.id));
  return ptsOk && orderOk;
}

const tables = [null, null, null];
const last = new Map();
let now = 0;
let idleWithCompatible = 0;
let overlap = 0;
let batches = 0;
let maxSimultaneous = 0;
let failures = 0;
let corrections = 0;
let intruders = 0;
const timeline = [];
let pending = [...groupMatches];
for (;;) {
  const busy = new Set(tables.flatMap((slot) => (slot ? [slot.match.teamAId, slot.match.teamBId] : [])));
  const free = tables.filter((slot) => slot === null).length;
  for (const match of suggestNextMatches({ pending, busyTeamIds: busy, freeTables: free, lastFinishedAt: last })) {
    const index = tables.findIndex((slot) => slot === null);
    // --juntos: todos os jogos duram 30 min, então as 3 mesas terminam no mesmo minuto.
    tables[index] = { match, start: now, end: now + (TOGETHER ? 30 : 15 + Math.floor(random() * 31)) };
    pending = pending.filter((item) => item.id !== match.id);
    timeline.push({ minute: now, table: index + 1, teams: [team(match.teamAId).name, team(match.teamBId).name] });
  }
  const busyNow = tables.flatMap((slot) => (slot ? [slot.match.teamAId, slot.match.teamBId] : []));
  if (new Set(busyNow).size !== busyNow.length) overlap += 1;
  if (tables.some((slot) => slot === null) && pending.some((m) => !busyNow.includes(m.teamAId) && !busyNow.includes(m.teamBId))) idleWithCompatible += 1;
  const active = tables.map((slot, index) => ({ slot, index })).filter((item) => item.slot);
  if (active.length === 0) break;
  const next = Math.min(...active.map((item) => item.slot.end));
  now = next;
  // Todos os jogos que terminam neste minuto lançam o placar AO MESMO TEMPO.
  const ending = active.filter((item) => item.slot.end === now);
  maxSimultaneous = Math.max(maxSimultaneous, ending.length);
  const replies = await Promise.all(ending.map(({ slot }) => {
    const score = pick(SCORES);
    ledger.set(slot.match.id, score);
    return call("POST", `/api/matches/${slot.match.id}/result`, tokens.get(playerOf(slot.match)), score);
  }));
  failures += replies.filter((reply) => reply.status !== 200).length;
  for (const { slot, index } of ending) {
    last.set(slot.match.teamAId, now);
    last.set(slot.match.teamBId, now);
    tables[index] = null;
  }
  batches += 1;
  // De vez em quando: um parceiro corrige o placar; um intruso tenta lançar.
  if (random() < 0.3) {
    const target = ending[0].slot.match;
    const score = pick(SCORES);
    const reply = await call("POST", `/api/matches/${target.id}/result`, tokens.get(playerOf(target)), score);
    if (reply.status === 200) { ledger.set(target.id, score); corrections += 1; } else failures += 1;
  }
  if (random() < 0.3) {
    const target = ending[0].slot.match;
    const reply = await call("POST", `/api/matches/${target.id}/result`, tokens.get(outsiderOf(target)), SCORES[0]);
    if (reply.status === 403) intruders += 1; else failures += 1;
  }
  if (!(await standingsOk())) failures += 1;
}
check("mesas", "21 jogos disputados pelas 3 mesas, cada dupla contra as outras 6 exatamente uma vez", ledger.size === 21 && sql("select count(*) from public.truco_matches where stage = 'grupos' and sets_a is not null") === "21");
check("mesas", "nenhuma dupla escalada em duas mesas ao mesmo tempo", overlap === 0);
check("mesas", "nenhuma mesa ficou vazia enquanto havia confronto possível", idleWithCompatible === 0);
check("mesas", TOGETHER ? "3 jogos terminando no mesmo minuto em todas as rodadas: placares lançados juntos, todos gravados" : "jogos terminando juntos: placares lançados ao mesmo tempo, todos gravados", failures === 0 && (!TOGETHER || maxSimultaneous === 3), `${batches} lotes, até ${maxSimultaneous} jogos terminando no mesmo minuto, ${corrections} correções, ${intruders} intrusos barrados (403); fase de grupos em ${now} min`);
check("classificação", "classificação conferida por cálculo independente depois de cada lote", failures === 0);

// Empate absoluto (raro com placares sorteados): o administrador decide, como no dia.
for (let guard = 0; guard < 5; guard += 1) {
  const st = (await call("GET", "/api/bracket/status", admin)).body;
  if (st.groupStage !== "empate-pendente") break;
  const rows = (await call("GET", "/api/groups/A/standings", admin)).body.filter((r) => r.tiePending);
  const sig = (r) => [r.pontos, r.vitorias, r.vitorias2x0, r.confrontoDireto, r.saldoSets].join();
  const cluster = rows.filter((r) => sig(r) === sig(rows[0]));
  await call("POST", "/api/groups/A/tiebreak", admin, { orderedTeamIds: cluster.map((r) => r.teamId) });
  console.log("  empate absoluto decidido pelo administrador:", cluster.map((r) => team(r.teamId).name).join(", "));
}

// ---------- 4. Mata-mata ----------
const finalTable = (await call("GET", "/api/groups/A/standings", admin)).body.sort((a, b) => a.position - b.position).map((r) => r.teamId);
const at = (position) => finalTable[position - 1];
const ROUND = { Q: "Quartas de final", S: "Semifinal", T: "Disputa de 3º lugar", F: "Final" };
const ko = async (key) => (await call("GET", "/api/matches?stage=mata-mata", admin)).body.find((m) => m.round === ROUND[key[0]] && m.order === (key.length > 1 ? Number(key[1]) - 1 : 0));
const winner = (m) => (m.result.setsA > m.result.setsB ? m.teamAId : m.teamBId);
const loser = (m) => (m.result.setsA > m.result.setsB ? m.teamBId : m.teamAId);
async function playTogether(keys) {
  const games = await Promise.all(keys.map(ko));
  const replies = await Promise.all(games.map((m) => call("POST", `/api/matches/${m.id}/result`, tokens.get(playerOf(m)), pick(SCORES))));
  return { games: await Promise.all(keys.map(ko)), ok: replies.every((reply) => reply.status === 200) };
}
const [q1, q2] = [await ko("Q1"), await ko("Q2")];
check("chaveamento", "7º eliminado; quartas 3º × 6º e 4º × 5º; 1º e 2º esperam na semifinal", q1.teamAId === at(3) && q1.teamBId === at(6) && q2.teamAId === at(4) && q2.teamBId === at(5) && !(await call("GET", "/api/matches?stage=mata-mata", admin)).body.some((m) => [m.teamAId, m.teamBId].includes(at(7))));
const quarters = await playTogether(["Q1", "Q2"]);
const [s1, s2] = [await ko("S1"), await ko("S2")];
check("chaveamento", "semifinais: 1º × vencedor de 4º×5º e 2º × vencedor de 3º×6º (quartas lançadas juntas)", quarters.ok && s1.teamAId === at(1) && s1.teamBId === winner(quarters.games[1]) && s2.teamAId === at(2) && s2.teamBId === winner(quarters.games[0]));
const semis = await playTogether(["S1", "S2"]);
const [final, third] = [await ko("F"), await ko("T")];
check("chaveamento", "final entre os vencedores e 3º lugar entre os perdedores das semifinais (semis lançadas juntas)", semis.ok && final.teamAId === winner(semis.games[0]) && final.teamBId === winner(semis.games[1]) && third.teamAId === loser(semis.games[0]) && third.teamBId === loser(semis.games[1]));
const lastRound = await playTogether(["F", "T"]);
const [f, t] = lastRound.games;
const st = (await call("GET", "/api/bracket/status", admin)).body;
const podium = { campeao: team(winner(f)).name, vice: team(loser(f)).name, terceiro: team(winner(t)).name, quarto: team(loser(t)).name };
check("campeão", "final e 3º lugar lançados juntos: campeão e vice registrados, edição encerrada", lastRound.ok && st.editionFinished === true && st.champion?.teamId === winner(f) && st.runnerUp?.teamId === loser(f) && sql("select current_phase from public.truco_championships where edition = 5") === "Campeonato Finalizado");
check("campeão", "histórico: uma linha da 5ª edição com campeão, vice e placar; edições 1 a 4 intactas", sql("select count(*) from public.truco_history where edition = 5") === "1" && sql("select champion_team_id || '|' || runner_up_team_id from public.truco_history where edition = 5") === `${winner(f)}|${loser(f)}` && sql("select string_agg(edition || ':' || champion_team_id, ',' order by edition) from public.truco_history where edition < 5") === historyBefore.split(",").slice(0, 4).join(","));
const afterEnd = await call("POST", `/api/matches/${f.id}/result`, tokens.get(playerOf(f)), SCORES[0]);
check("campeão", "depois do encerramento, jogador não lança nem edita (403)", afterEnd.status === 403 && afterEnd.body.code === "edition_finished");
const total = Number(sql("select count(*) from public.truco_matches where sets_a is not null and truco_championship_id = (select truco_id from public.truco_championships where edition = 5)"));
check("campeonato", "27 partidas com placar: 21 do grupo + 2 quartas + 2 semifinais + 3º lugar + final", total === 27);
check("campeonato", "todo placar tem auditoria com autor", sql("select count(*) from public.truco_matches m where sets_a is not null and not exists (select 1 from public.truco_audit_log a where a.entity = 'match_result' and a.entity_id = m.truco_id and a.truco_actor_id is not null)") === "0");

console.log("\nPódio:", JSON.stringify(podium));
console.log("Classificação final do grupo:", finalTable.map((id, index) => `${index + 1}º ${team(id).name}`).join(" · "));
console.log("Primeiras mesas:", timeline.slice(0, 6).map((item) => `min ${item.minute} mesa ${item.table}: ${item.teams.join(" × ")}`).join(" | "));
console.log(`\nResumo (semente ${seedArg}): ${results.filter((r) => r.ok).length} PASSOU, ${results.filter((r) => !r.ok).length} FALHOU`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
