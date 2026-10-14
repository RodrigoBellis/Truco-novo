// 27 primeiros placares pela API local, com os 14 participantes oficiais em uma cópia local.
// Não usa navegador, arquivos temporários, .env oficial ou serviços remotos.
// Antes: backend de homologação em 3101 e PostgreSQL local em 55450.
// node backend/scripts/homologacao-oficial-api.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { buildGroupRounds, pairKey } from "../../shared/dist/index.js";

const API = "http://127.0.0.1:3101";
const sql = (query) => execFileSync("C:/Program Files/PostgreSQL/17/bin/psql.exe", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", "55450", "-U", "postgres", "-d", "truco_homologacao", "-c", query], { encoding: "utf8", env: { ...process.env, PGCLIENTENCODING: "UTF8" } }).trim();
assert.equal(sql("select nome from homologacao.ambiente"), "truco-homologacao-local");
const call = async (method, path, token, data) => {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};
let checks = 0;
function check(name, ok) { assert.ok(ok, name); checks += 1; console.log("PASSOU " + name); }
// Zera também os limites de tentativas, apenas pelas rotas exclusivas de homologação.
assert.equal((await call("POST", "/api/rehearsal/reset")).status, 204);
const setup = execFileSync(process.execPath, ["backend/scripts/homologacao-participantes.mjs"], { encoding: "utf8" });
check("preparação oficial: verificações de participantes e história passaram", setup.includes("PASSOU  14 participantes") && !setup.includes("FALHOU"));
const admin = (await call("POST", "/api/auth/login", null, { email: "admin@trucodonovo.com", password: "ensaio-2026" })).body.token;
await call("POST", "/api/admin/results-lock", admin, { locked: true });
// O retrato oficial local foi preparado sem jogos; gera somente os confrontos desta edição.
check("21 confrontos locais recriados", (await call("POST", "/api/groups/generate-matches", admin)).body.matchesCreated === 21);
assert.equal((await call("POST", "/api/admin/access/restart", admin)).status, 200);
const roster = (await call("GET", "/api/players/roster")).body;
const tokens = new Map();
for (const player of roster) {
  const reply = await call("POST", "/api/auth/first-access", null, { playerId: player.id, newPassword: randomBytes(12).toString("base64url") });
  assert.equal(reply.status, 200, player.name);
  tokens.set(player.id, reply.body.token);
}
check("14 identidades autenticadas com senhas individuais só em memória", tokens.size === 14);
const teams = (await call("GET", "/api/teams", admin)).body.filter((t) => t.status === "aprovada");
const games = (await call("GET", "/api/matches?stage=grupos", admin)).body;
const historicalHash = () => sql("select md5(string_agg(row_to_json(h)::text, ',' order by edition)) from public.truco_history h where edition<5");
const historyBefore = historicalHash();
const rounds = buildGroupRounds([...teams].sort((a,b) => a.name.localeCompare(b.name, "pt-BR")).map((t) => t.id));
const roundByPair = new Map(rounds.flatMap((r) => r.tables.map((t) => [pairKey(t.teamAId,t.teamBId), r.round])));
check("rodadas pelo código: 7 × 3 mesas, 21 pares, cada dupla descansa uma vez", rounds.length === 7 && rounds.every((r) => r.tables.length === 3 && new Set(r.tables.flatMap((t) => [t.teamAId,t.teamBId]).concat(r.restingTeamId)).size === 7) && roundByPair.size === 21 && new Set(rounds.map((r) => r.restingTeamId)).size === 7);
let seed = 20261014;
const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/4294967296; };
const order = [...games];
for (let i=order.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [order[i],order[j]]=[order[j],order[i]]; }
order.unshift(...order.splice(order.findIndex((m) => roundByPair.get(pairKey(m.teamAId,m.teamBId))===7),1));
const priority = new Map(teams.map((t,i) => [t.id,i]));
const favourite = (m) => priority.get(m.teamAId)<priority.get(m.teamBId) ? m.teamAId : m.teamBId;
const scoreFor = (m,w,loser=0) => m.teamAId===w ? {setsA:2,setsB:loser} : {setsA:loser,setsB:2};
const member = (id) => teams.find((t) => t.id===id).player1Id;
const ledger = new Map();
async function save(m,score) {
  for (let attempt=0;attempt<10;attempt++) {
    const r=await call("POST",`/api/matches/${m.id}/result`,tokens.get(member(m.teamAId)),score);
    if (r.status===200) return;
    assert.ok([409,503].includes(r.status), `placar recusado HTTP ${r.status}`);
    await new Promise((resolve) => setTimeout(resolve,150));
  }
  throw new Error("placar não confirmou após reenvios");
}
async function standings() {
  const expected=teams.map((t) => ({teamId:t.id, pontos:0,vitorias:0,vitorias2x0:0,saldoSets:0,jogos:0}));
  for (const m of games) {
    const s=ledger.get(m.id); if(!s) continue;
    for(const [id,a,b] of [[m.teamAId,s.setsA,s.setsB],[m.teamBId,s.setsB,s.setsA]]) {
      const row=expected.find((r) => r.teamId===id); row.jogos++; row.saldoSets+=a-b;
      row.pontos+=a>b ? (b===0?3:2) : (a===1?1:0);
      if(a>b) {row.vitorias++; if(b===0) row.vitorias2x0++;}
    }
  }
  const key=(r) => `${r.pontos}/${r.vitorias}/${r.vitorias2x0}`;
  const direct=(r) => games.filter((m) => ledger.has(m.id) && expected.some((o) => o.teamId===m.teamAId && key(o)===key(r)) && expected.some((o) => o.teamId===m.teamBId && key(o)===key(r)) && (ledger.get(m.id).setsA>ledger.get(m.id).setsB?m.teamAId:m.teamBId)===r.teamId).length;
  const sorted=[...expected].sort((a,b) => b.pontos-a.pontos || b.vitorias-a.vitorias || b.vitorias2x0-a.vitorias2x0 || direct(b)-direct(a) || b.saldoSets-a.saldoSets);
  const actual=(await call("GET","/api/groups/A/standings",admin)).body;
  for(const row of actual) for(const field of ["pontos","vitorias","vitorias2x0","saldoSets","jogos"]) assert.equal(row[field],expected.find((r) => r.teamId===row.teamId)[field],field);
  // Empates estatísticos provisórios não recebem ordem fictícia; compara as posições decididas.
  for(let i=0;i<actual.length;i++) {
    const wanted=sorted[i]; const got=expected.find((r) => r.teamId===actual[i].teamId);
    assert.ok(wanted.teamId===got.teamId || (key(wanted)===key(got) && direct(wanted)===direct(got) && wanted.saldoSets===got.saldoSets));
  }
  return actual;
}
await call("POST","/api/admin/results-lock",admin,{locked:false});
const visualOrder=[];
for(const [i,m] of order.entries()) {
  const score=scoreFor(m,favourite(m),i%3===0?1:0);
  await save(m,score); ledger.set(m.id,score); await standings();
  visualOrder.push(roundByPair.get(pairKey(m.teamAId,m.teamBId)));
  if([0,7,14].includes(i)) {
    for(const edited of [scoreFor(m,favourite(m),score.setsA+score.setsB===2?1:0),scoreFor(m,favourite(m)===m.teamAId?m.teamBId:m.teamAId,1),score]) {
      await save(m,edited); ledger.set(m.id,edited); await standings();
    }
  }
  const ko=(await call("GET","/api/matches?stage=mata-mata",admin)).body;
  assert.equal(ko.length,i===20?2:0);
}
check("21 placares pela API e 9 correções: estatísticas e classificação conferidas em cada alteração", ledger.size===21);
console.log("Ordem das rodadas dos lançamentos: "+visualOrder.join(", "));
check("Rodada 7 antes da Rodada 1, sem bloqueio por sequência", visualOrder[0]===7);
const ranking=await standings();
const ko=async (round) => (await call("GET","/api/matches?stage=mata-mata",admin)).body.filter((m) => m.round===round).sort((a,b) => a.order-b.order);
const quarters=await ko("Quartas de final");
check("quartas automáticas: 3º×6º e 4º×5º", quarters[0].teamAId===ranking[2].teamId && quarters[0].teamBId===ranking[5].teamId && quarters[1].teamAId===ranking[3].teamId && quarters[1].teamBId===ranking[4].teamId);
await Promise.all(quarters.map((m) => save(m,scoreFor(m,m.teamAId))));
const semis=await ko("Semifinal");
check("semifinais automáticas: 1º×vencedor Q2 e 2º×vencedor Q1", semis.length===2 && semis[0].teamAId===ranking[0].teamId && semis[0].teamBId===quarters[1].teamAId && semis[1].teamAId===ranking[1].teamId && semis[1].teamBId===quarters[0].teamAId);
await Promise.all(semis.map((m) => save(m,scoreFor(m,m.teamAId,1))));
const [final]=await ko("Final"); const [third]=await ko("Disputa de 3º lugar");
check("final entre vencedores e terceiro lugar entre perdedores", final.teamAId===semis[0].teamAId && final.teamBId===semis[1].teamAId && third.teamAId===semis[0].teamBId && third.teamBId===semis[1].teamBId);
await Promise.all([save(final,scoreFor(final,final.teamAId,1)),save(third,scoreFor(third,third.teamBId))]);
const status=(await call("GET","/api/bracket/status",admin)).body;
const all=(await call("GET","/api/matches",admin)).body;
check("27 primeiras gravações pela API; campeonato encerrado, sem duplicidades ou pendência", all.length===27 && all.every((m) => m.result && m.status==="realizado") && status.editionFinished && !status.syncPending && status.anomalies.length===0 && new Set(all.map((m) => `${m.stage}/${m.round}/${m.order}`)).size===27);
check("campeão e vice persistidos automaticamente no histórico", sql(`select champion_team_id || '|' || runner_up_team_id from public.truco_history where edition=5`)===`${final.teamAId}|${final.teamBId}`);
check("terceiro colocado persistido no resultado da disputa", (await ko("Disputa de 3º lugar"))[0].result.setsB===2);
check("quatro edições históricas preservadas integralmente", historicalHash()===historyBefore);
const name=(id) => teams.find((t) => t.id===id).name;
console.log(`PÓDIO LOCAL SIMULADO: campeão ${name(final.teamAId)}; vice ${name(final.teamBId)}; terceiro ${name(third.teamBId)}.`);
console.log(`${checks} PASSOU; 0 FALHOU. Visual de navegador: NÃO TESTADO.`);
