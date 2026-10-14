// Empate absoluto na homologação LOCAL: três duplas do grupo único iguais nos cinco critérios,
// disputando 1º e 2º (semifinal) e 3º (quartas).
//   node backend/scripts/homologacao-empate-api.mjs montar    -> joga os 21 jogos e para no empate
//   node backend/scripts/homologacao-empate-api.mjs decidir   -> recusas, decisão do administrador, chaveamento
//   node backend/scripts/homologacao-empate-api.mjs corrigir  -> (em vez de decidir) um placar corrigido desfaz o empate
// Requer o backend de homologação em 3101. Só fala com 127.0.0.1.
const API = "http://127.0.0.1:3101";
const phase = process.argv[2] ?? "montar";
const results = [];
const check = (name, ok, evidence = "") => { results.push(ok); console.log(`${ok ? "PASSOU " : "FALHOU "} ${name}${evidence ? " — " + evidence : ""}`); };
const call = async (method, path, token, body) => { const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { status: r.status, body: t ? JSON.parse(t) : null }; };

if (phase === "montar") check("reset", (await call("POST", "/api/rehearsal/reset")).status === 204);
const status = (await call("GET", "/api/rehearsal/status")).body;
const tokens = new Map();
for (const account of status.accounts) tokens.set(account.playerId, (await call("POST", "/api/auth/login", null, { playerId: account.playerId, password: status.password })).body.token);
const admin = tokens.get(status.ids.admin);
const teams = (await call("GET", "/api/teams", admin)).body;
const slot = (id) => (Number(/\d+/.exec(teams.find((t) => t.id === id).name)[0]) + 1) / 2;
const at = (n) => teams.find((t) => slot(t.id) === n);
const matches = (await call("GET", "/api/matches?stage=grupos", admin)).body;
const game = (a, b) => matches.find((m) => [m.teamAId, m.teamBId].includes(a.id) && [m.teamAId, m.teamBId].includes(b.id));
const play = (winner, loser, loserSets = 0, by = winner) => { const m = game(winner, loser); return call("POST", `/api/matches/${m.id}/result`, tokens.get(by.player1Id), m.teamAId === winner.id ? { setsA: 2, setsB: loserSets } : { setsA: loserSets, setsB: 2 }); };
const [a1, a2, a3, a4, a5, a6, a7] = [1, 2, 3, 4, 5, 6, 7].map((n) => at(n));
const bracketStatus = async () => (await call("GET", "/api/bracket/status", admin)).body;
const standings = async (g) => (await call("GET", `/api/groups/${g}/standings`, admin)).body;

if (phase === "montar") {
  await call("POST", "/api/admin/results-lock", admin, { locked: false });
  let failures = 0;
  const ok = async (p) => { if ((await p).status !== 200) failures += 1; };
  // Ciclo A1>A2, A2>A3, A3>A1 (todos 2x0); os três vencem A4..A7 por 2x0; entre A4..A7 vence o de menor número.
  for (const top of [a1, a2, a3]) for (const low of [a4, a5, a6, a7]) await ok(play(top, low));
  for (const [i, x] of [a4, a5, a6, a7].entries()) for (const y of [a4, a5, a6, a7].slice(i + 1)) await ok(play(x, y));
  await ok(play(a1, a2)); await ok(play(a2, a3));
  const last = await play(a3, a1);
  check("21 jogos lançados; o que fecha o empate é aceito normalmente", failures === 0 && last.status === 200, `HTTP ${last.status}`);
  const rows = await standings("A");
  const tied = rows.filter((r) => r.tiePending).map((r) => r.teamId).sort();
  check("as três duplas ficam iguais nos 5 critérios e marcadas como empate pendente", JSON.stringify(tied) === JSON.stringify([a1.id, a2.id, a3.id].sort()) && rows.filter((r) => r.tiePending).every((r) => r.pontos === 15 && r.vitorias === 5 && r.vitorias2x0 === 5 && r.confrontoDireto === 1 && r.saldoSets === 8), "15 pts, 5 vitórias, 5 por 2x0, 1 no confronto direto, saldo +8");
  const st = await bracketStatus();
  check("sistema não inventa classificação: sem chaveamento, fase continua 'Fase de Grupos', empate do grupo único sinalizado", st.groupStage === "empate-pendente" && JSON.stringify(st.pendingTieGroups) === '["A"]' && st.bracketGenerated === false && st.phase === "Fase de Grupos" && (await call("GET", "/api/matches?stage=mata-mata", admin)).body.length === 0);
  await new Promise((r) => setTimeout(r, 6000));
  check("worker não gera nada sozinho enquanto o empate espera decisão (um ciclo)", (await bracketStatus()).bracketGenerated === false);
}

if (phase === "decidir") {
  const player = tokens.get(a1.player1Id);
  check("jogador não decide empate (403)", (await call("POST", "/api/groups/A/tiebreak", player, { orderedTeamIds: [a1.id, a2.id, a3.id] })).status === 403);
  const partial = await call("POST", "/api/groups/A/tiebreak", admin, { orderedTeamIds: [a1.id, a2.id] });
  const foreign = await call("POST", "/api/groups/A/tiebreak", admin, { orderedTeamIds: [a1.id, a2.id, a4.id] });
  const repeated = await call("POST", "/api/groups/A/tiebreak", admin, { orderedTeamIds: [a1.id, a1.id, a2.id] });
  const wrongGroup = await call("POST", "/api/groups/B/tiebreak", admin, { orderedTeamIds: [a1.id, a2.id, a3.id] });
  check("decisões incompletas, com dupla de fora, repetida ou em grupo inexistente são recusadas", [partial, foreign, repeated].every((r) => r.status === 409) && [400, 409].includes(wrongGroup.status), [partial, foreign, repeated, wrongGroup].map((r) => r.status).join("/"));
  check("as recusas não geraram chaveamento", (await bracketStatus()).bracketGenerated === false);
  const decided = await call("POST", "/api/groups/A/tiebreak", admin, { orderedTeamIds: [a3.id, a1.id, a2.id] });
  const rows = await standings("A");
  check("administrador decide a ordem A3, A1, A2: posições 1, 2 e 3 gravadas e empate encerrado", decided.status === 201 && rows.slice(0, 3).map((r) => r.teamId).join() === [a3.id, a1.id, a2.id].join() && rows.every((r) => !r.tiePending), `HTTP ${decided.status}`);
  const st = await bracketStatus();
  const bracket = (await call("GET", "/api/bracket", admin)).body;
  const ko = (await call("GET", "/api/matches?stage=mata-mata", admin)).body;
  check("o mata-mata nasce na mesma chamada da decisão, sem outro clique", st.bracketGenerated && st.groupStage === "definida" && st.phase === "Mata-mata" && bracket.length === 6 && ko.length === 2);
  const q1 = ko.find((m) => m.round === "Quartas de final" && m.order === 0);
  const semis = bracket.filter((b) => b.round === "semifinal").sort((x, y) => x.order - y.order);
  check("chaveamento segue a decisão: A3 e A1 direto na semifinal, A2 (3º) nas quartas contra o 6º", semis[0].slotA.teamId === a3.id && semis[1].slotA.teamId === a1.id && q1.teamAId === a2.id && q1.teamBId === a6.id);
  check("decidir de novo depois do chaveamento é recusado (409)", (await call("POST", "/api/groups/A/tiebreak", admin, { orderedTeamIds: [a1.id, a2.id, a3.id] })).status === 409);
}

if (phase === "corrigir") {
  // Sem decisão do administrador: o próprio jogador corrige um placar e o empate deixa de existir.
  const fix = await play(a1, a4, 1, a4);
  const rows = await standings("A");
  const st = await bracketStatus();
  check("corrigir um placar (A1 2x1 A4) desfaz o empate e o mata-mata nasce sozinho", fix.status === 200 && rows.every((r) => !r.tiePending) && st.bracketGenerated && st.phase === "Mata-mata", "ordem: " + rows.slice(0, 3).map((r) => slot(r.teamId)).join(", "));
  check("ordem resolvida pelos critérios: A2 e A3 com 15 pts decididos no confronto direto (A2 venceu A3), A1 em 3º", rows.slice(0, 3).map((r) => r.teamId).join() === [a2.id, a3.id, a1.id].join());
}
console.log(`\n${results.filter(Boolean).length} PASSOU, ${results.filter((r) => !r).length} FALHOU`);
process.exit(results.every(Boolean) ? 0 : 1);
