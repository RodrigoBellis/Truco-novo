import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { RESULTS_LOCKED_MESSAGE } from "@truco/shared";
import { resultsLockBlocks } from "../services/matchAuthorization.js";

test("cadeado fechado bloqueia só jogadores; administradores continuam podendo", () => {
  assert.equal(resultsLockBlocks("jogador", true), true);
  assert.equal(resultsLockBlocks(null, true), true);
  assert.equal(resultsLockBlocks("admin", true), false);
  assert.equal(resultsLockBlocks("superadmin", true), false);
  assert.equal(resultsLockBlocks("jogador", false), false);
});

/**
 * Teste da API de verdade (Express + rotas reais) com o Supabase simulado: nenhuma chamada sai
 * para a internet. Cada requisição "manual" abaixo é o que um jogador mandaria direto para a
 * API, sem passar pela tela.
 */
test("API: resultado só entra com o cadeado aberto, e o estado vale para criar, editar e depois de bloquear de novo", async (t) => {
  process.env.SUPABASE_URL = "https://lock-test.example.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

  const ids = {
    championship: "11111111-1111-4111-8111-111111111111",
    match: "22222222-2222-4222-8222-222222222222",
    teamA: "33333333-3333-4333-8333-333333333333",
    teamB: "44444444-4444-4444-8444-444444444444",
    playerUser: "55555555-5555-4555-8555-555555555555",
    adminUser: "66666666-6666-4666-8666-666666666666",
    player: "77777777-7777-4777-8777-777777777777",
  };
  // Estado do "banco" simulado.
  const db = {
    lockColumnExists: true,
    resultsLocked: true as boolean | undefined,
    sets: null as { a: number; b: number } | null,
    lockUpdates: [] as boolean[],
    resultWrites: [] as Array<{ a: number; b: number; actor: string }>,
  };
  const accounts: Record<string, { userId: string; role: string; playerId: string | null; mustChange: boolean }> = {
    "token-jogador": { userId: ids.playerUser, role: "jogador", playerId: ids.player, mustChange: false },
    "token-admin": { userId: ids.adminUser, role: "admin", playerId: null, mustChange: false },
  };

  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname !== "lock-test.example.invalid") return realFetch(input, init);

    const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
    const body = request.method === "GET" ? null : await request.text().then((text) => (text ? JSON.parse(text) : null));
    const path = url.pathname;

    if (path === "/auth/v1/user") {
      const account = accounts[(request.headers.get("authorization") ?? "").replace("Bearer ", "")];
      return account ? json({ id: account.userId, aud: "authenticated", role: "authenticated", email: "teste@example.invalid" }) : json({ message: "invalid" }, 401);
    }
    if (path.endsWith("/truco_profiles")) {
      const userId = (url.searchParams.get("truco_id") ?? "").replace("eq.", "");
      const account = Object.values(accounts).find((item) => item.userId === userId);
      return json(account ? { truco_id: account.userId, truco_player_id: account.playerId, role: account.role, must_change_password: account.mustChange } : null);
    }
    if (path.endsWith("/truco_championships")) {
      if (request.method === "PATCH") {
        if (!db.lockColumnExists) return json({ code: "PGRST204", message: "Could not find the 'results_locked' column" }, 400);
        db.resultsLocked = body.results_locked;
        db.lockUpdates.push(body.results_locked);
        return new Response(null, { status: 204 });
      }
      const row: Record<string, unknown> = { truco_id: ids.championship, edition: 5, name: "5ª Edição", year: 2026, status: "em_andamento", current_phase: "Fase de Grupos", draw_status: "realizado" };
      if (db.lockColumnExists) row.results_locked = db.resultsLocked;
      return json(row);
    }
    if (path.endsWith("/truco_matches")) {
      return json({
        truco_id: ids.match, truco_championship_id: ids.championship, stage: "grupos", round: "Grupo A", match_order: 0, truco_group_id: null,
        truco_team_a_id: ids.teamA, truco_team_b_id: ids.teamB, sets_a: db.sets?.a ?? null, sets_b: db.sets?.b ?? null,
        status: db.sets ? "realizado" : "pendente", table_number: null, block_number: null, queue_position: null,
      });
    }
    if (path.endsWith("/truco_groups") || path.endsWith("/truco_bracket_matches")) return json([]);
    if (path.endsWith("/truco_team_memberships")) {
      return json([
        { truco_team_id: ids.teamA, truco_player_1_id: ids.player, truco_player_2_id: "88888888-8888-4888-8888-888888888888" },
        { truco_team_id: ids.teamB, truco_player_1_id: "99999999-9999-4999-8999-999999999991", truco_player_2_id: "99999999-9999-4999-8999-999999999992" },
      ]);
    }
    if (path.endsWith("/rpc/truco_rpc_record_match_result")) {
      db.sets = { a: body.p_sets_a, b: body.p_sets_b };
      db.resultWrites.push({ a: body.p_sets_a, b: body.p_sets_b, actor: body.p_actor_id });
      return new Response(null, { status: 204 });
    }
    return json({ message: "rota do Supabase não simulada: " + request.method + " " + path }, 500);
  });

  const { default: express } = await import("express");
  const { matchesRoutes } = await import("./matchesRoutes.js");
  const { adminRoutes } = await import("./adminRoutes.js");
  const { errorHandler } = await import("../middleware/errorHandler.js");
  const app = express();
  app.use(express.json());
  app.use("/api/matches", matchesRoutes);
  app.use("/api/admin", adminRoutes);
  app.use(errorHandler);
  const server = app.listen(0);
  t.after(() => server.close());
  const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;

  const call = async (method: string, path: string, token: string | null, payload?: unknown) => {
    const response = await realFetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    return { status: response.status, body: (response.status === 204 ? {} : await response.json()) as Record<string, unknown> };
  };
  const postResult = (token: string | null, setsA: number, setsB: number) => call("POST", "/api/matches/" + ids.match + "/result", token, { setsA, setsB });

  // 1. Bloqueado: o jogador consulta o estado, mas a tentativa de LANÇAR é recusada pela API.
  assert.deepEqual((await call("GET", "/api/matches/lock", "token-jogador")).body, { locked: true });
  const blockedCreate = await postResult("token-jogador", 2, 0);
  assert.deepEqual([blockedCreate.status, blockedCreate.body], [403, { message: RESULTS_LOCKED_MESSAGE, code: "results_locked" }]);
  assert.equal(db.resultWrites.length, 0, "nada foi gravado");
  // Sem sessão a requisição nem chega à checagem do cadeado.
  assert.equal((await postResult(null, 2, 0)).status, 401);

  // 2. Jogador não abre o cadeado; pedido malformado também não muda nada.
  assert.equal((await call("POST", "/api/admin/results-lock", "token-jogador", { locked: false })).status, 403);
  assert.equal((await call("POST", "/api/admin/results-lock", "token-admin", { locked: "false" })).status, 400);
  assert.deepEqual(db.lockUpdates, []);

  // 3. Com o cadeado fechado o administrador continua lançando.
  assert.equal((await postResult("token-admin", 2, 1)).status, 200);
  assert.deepEqual(db.resultWrites.map((write) => [write.a, write.b, write.actor]), [[2, 1, ids.adminUser]]);

  // 4. Bloqueado: o jogador também não EDITA o placar que já existe.
  const blockedEdit = await postResult("token-jogador", 0, 2);
  assert.deepEqual([blockedEdit.status, blockedEdit.body.code], [403, "results_locked"]);
  assert.equal(db.resultWrites.length, 1);

  // 5. O administrador libera; o jogador passa a lançar/corrigir o jogo da própria dupla.
  assert.deepEqual(await call("POST", "/api/admin/results-lock", "token-admin", { locked: false }), { status: 200, body: { locked: false } });
  assert.deepEqual((await call("GET", "/api/matches/lock", "token-jogador")).body, { locked: false });
  const allowed = await postResult("token-jogador", 2, 0);
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.body.result, { setsA: 2, setsB: 0 });
  assert.deepEqual(db.resultWrites.at(-1), { a: 2, b: 0, actor: ids.playerUser });

  // 6. Bloqueado de novo: novas alterações voltam a falhar e o placar fica como estava.
  assert.equal((await call("POST", "/api/admin/results-lock", "token-admin", { locked: true })).status, 200);
  assert.equal((await postResult("token-jogador", 1, 2)).status, 403);
  assert.deepEqual(db.sets, { a: 2, b: 0 });
  assert.deepEqual(db.lockUpdates, [false, true]);

  // 7. Sem a coluna no banco (migração ainda não aplicada) o sistema fecha, não abre:
  //    jogador continua bloqueado e o administrador recebe a instrução em vez de um falso "liberado".
  db.lockColumnExists = false;
  assert.deepEqual((await call("GET", "/api/matches/lock", "token-jogador")).body, { locked: true });
  assert.equal((await postResult("token-jogador", 2, 0)).status, 403);
  const missing = await call("POST", "/api/admin/results-lock", "token-admin", { locked: false });
  assert.equal(missing.status, 503);
  assert.match(String(missing.body.message), /migration 202610070002_results_lock\.sql/);
});
