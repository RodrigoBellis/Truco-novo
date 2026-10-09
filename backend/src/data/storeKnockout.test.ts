import test from "node:test";
import assert from "node:assert/strict";

/**
 * Repositório real (Supabase) com a rede simulada: confere quais instruções as gravações novas
 * do avanço automático mandariam ao banco. Nenhuma chamada sai para a internet; isto NÃO
 * substitui a execução contra um banco de teste (restrições, RLS e gatilhos não existem aqui).
 */
test("repositório real: desfazer o mata-mata, gravar o campeão uma vez por edição e tratar unicidade", async (t) => {
  process.env.SUPABASE_URL = "https://store-test.example.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  delete process.env.TRUCO_REHEARSAL;

  const db = {
    historyRows: 0,
    members: { "team-campea": 0, "team-vice": 2 } as Record<string, number>,
    vicePair: ["p3", "p4"],
    bracketConflict: false,
  };
  const calls: Array<{ method: string; table: string; search: string; body: any }> = [];
  const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.hostname, "store-test.example.invalid");
    const text = request.method === "GET" || request.method === "DELETE" ? "" : await request.text();
    const table = url.pathname.split("/").pop()!;
    const call = { method: request.method, table, search: decodeURIComponent(url.search), body: text ? JSON.parse(text) : null };
    calls.push(call);

    if (table === "truco_bracket_matches" && request.method === "POST" && db.bracketConflict) return json({ code: "23505", message: "duplicate key value violates unique constraint \"truco_bracket_matches_slot_unique\"" }, 409);
    if (table === "truco_championships") return json({ truco_id: "edicao-5", edition: 5, name: "5ª Edição", year: 2026 });
    if (request.method === "DELETE") return new Response(null, { status: 204 });
    if (table === "truco_history" && request.method === "PATCH") return json(Array.from({ length: db.historyRows }, (_, index) => ({ truco_id: "hist-" + index })));
    if (table === "truco_history" && request.method === "POST") { db.historyRows += 1; return new Response(null, { status: 201 }); }
    if (table === "truco_history" && request.method === "GET") return json(db.historyRows ? [{ champion_team_id: "team-campea", runner_up_team_id: "team-vice", final_result: "2x1" }] : []);
    if (table === "truco_team_members" && request.method === "GET") {
      const teamId = /truco_team_id=eq\.([\w-]+)/.exec(call.search)![1];
      return json(Array.from({ length: db.members[teamId] ?? 0 }, (_, index) => ({ truco_player_id: teamId === "team-vice" ? db.vicePair[index] : "p" + (index + 1), position: index + 1 })));
    }
    if (table === "truco_team_members" && request.method === "POST") { db.members[call.body[0].truco_team_id] = 2; return new Response(null, { status: 201 }); }
    if (table === "truco_team_memberships") {
      const teamId = /truco_team_id=eq\.([\w-]+)/.exec(call.search)![1];
      return json([teamId === "team-campea" ? { truco_player_1_id: "p1", truco_player_2_id: "p2" } : { truco_player_1_id: "p3", truco_player_2_id: "p4" }]);
    }
    return json({ message: "não simulado: " + request.method + " " + table }, 500);
  });
  const warnings: string[] = [];
  t.mock.method(console, "warn", (message: string) => { warnings.push(message); });

  const { store } = await import("./store.js");
  const { StoreConflictError } = await import("./storeErrors.js");
  const of = (table: string, method: string) => calls.filter((call) => call.table === table && call.method === method);

  // Desfazer o mata-mata: chaveamento primeiro; dos jogos, só os de mata-mata ainda sem placar.
  await store.clearKnockout("edicao-5");
  assert.deepEqual(calls.map((call) => [call.method, call.table, call.search]), [
    ["DELETE", "truco_bracket_matches", "?truco_championship_id=eq.edicao-5"],
    ["DELETE", "truco_matches", "?truco_championship_id=eq.edicao-5&stage=eq.mata-mata&status=eq.pendente"],
  ]);

  // Campeão: sem linha da edição, insere uma; o par histórico só é preenchido para quem não tem.
  assert.equal(await store.getEditionChampion("edicao-5"), null);
  const entry = { championshipId: "edicao-5", edition: 5, name: "5ª Edição", year: 2026, championTeamId: "team-campea", runnerUpTeamId: "team-vice", finalResult: "2x1", notes: "nota" };
  await store.saveEditionChampion(entry);
  assert.equal(of("truco_history", "PATCH")[0].search, "?edition=eq.5&select=truco_id");
  assert.deepEqual(of("truco_history", "POST").map((call) => call.body), [{ edition: 5, name: "5ª Edição", year: 2026, champion_team_id: "team-campea", runner_up_team_id: "team-vice", final_result: "2x1", notes: "nota" }]);
  assert.deepEqual(of("truco_team_members", "POST").map((call) => call.body), [[
    { truco_team_id: "team-campea", truco_player_id: "p1", position: 1 },
    { truco_team_id: "team-campea", truco_player_id: "p2", position: 2 },
  ]], "o vice já tinha par histórico igual ao da edição: nada é escrito para ele");
  assert.deepEqual(warnings, []);
  assert.deepEqual(await store.getEditionChampion("edicao-5"), { championTeamId: "team-campea", runnerUpTeamId: "team-vice", finalResult: "2x1" });

  // Gravar de novo (final corrigida): atualiza a linha que existe; não insere outra nem repete o par.
  await store.saveEditionChampion({ ...entry, championTeamId: "team-vice", runnerUpTeamId: "team-campea", finalResult: "2x0" });
  assert.equal(of("truco_history", "POST").length, 1, "continua uma inserção só");
  assert.deepEqual(of("truco_history", "PATCH")[1].body, { champion_team_id: "team-vice", runner_up_team_id: "team-campea", final_result: "2x0", notes: "nota" });
  assert.equal(of("truco_team_members", "POST").length, 1);

  // Par histórico diferente do par da edição: não reescreve, só avisa.
  db.vicePair = ["p3", "outro-jogador"];
  await store.saveEditionChampion(entry);
  assert.equal(of("truco_team_members", "POST").length, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /par histórico diferente/);

  // Unicidade recusada pelo banco vira StoreConflictError (a sincronização relê e segue).
  db.bracketConflict = true;
  await assert.rejects(
    () => store.createBracketMatches("edicao-5", [{ id: "b1", round: "repescagem", label: "Repescagem 1", order: 0, slotA: { type: "direct", teamId: "a3" }, slotB: { type: "direct", teamId: "b4" } }]),
    StoreConflictError,
  );
  assert.equal(of("truco_bracket_matches", "POST")[0].body[0].round, "oitavas", "a repescagem continua gravada como 'oitavas' no enum do banco");
});
