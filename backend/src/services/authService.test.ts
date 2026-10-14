import test from "node:test";
import assert from "node:assert/strict";

test("logins de jogadores isolam suas sessões e preservam a conexão administrativa", async (t) => {
  process.env.SUPABASE_URL = "https://auth-test.example.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  const serviceHeaders: string[] = [];
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    let payload: unknown;
    if (url.pathname.endsWith("/token")) {
      const { email } = await request.json() as { email: string };
      const id = email.startsWith("one") ? "user-one" : "user-two";
      payload = {
        access_token: `${encode({ alg: "HS256" })}.${encode({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })}.${encode("test-signature")}`,
        refresh_token: `test-refresh-${id}`,
        token_type: "bearer",
        expires_in: 3600,
        user: { id, email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
      };
    } else {
      serviceHeaders.push(request.headers.get("authorization") ?? "");
      if (url.pathname.endsWith("/truco_profiles")) {
        const id = url.searchParams.get("truco_id")!.slice(3);
        payload = [{ truco_id: id, truco_player_id: `player-${id}`, email: `${id}@example.invalid`, role: "jogador", must_change_password: false }];
      } else if (url.pathname.endsWith("/truco_players")) {
        payload = [{ name: "Test player", avatar_url: null }];
      } else if (url.pathname.endsWith("/truco_championships")) {
        payload = [{ truco_id: "test-edition" }];
      } else if (url.pathname.endsWith("/truco_team_memberships")) {
        payload = [{ truco_team_id: "test-team" }];
      } else {
        throw new Error(`Unexpected test endpoint: ${url.pathname}`);
      }
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  });

  const { login } = await import("./authService.js");
  const { supabaseAdmin } = await import("../data/supabaseClient.js");
  const first = await login({ email: "one@example.invalid" }, "test-password");
  const second = await login({ email: "two@example.invalid" }, "test-password");
  assert.equal(first.user.id, "user-one");
  assert.equal(second.user.id, "user-two");
  assert.notEqual(first.token, second.token);

  const concurrent = await Promise.all([
    login({ email: "one@example.invalid" }, "test-password"),
    login({ email: "two@example.invalid" }, "test-password"),
  ]);
  assert.deepEqual(concurrent.map((response) => response.user.id), ["user-one", "user-two"]);
  assert.ok(serviceHeaders.length > 0);
  assert.ok(serviceHeaders.every((header) => header === "Bearer test-service-role-key"));
  assert.equal((await supabaseAdmin.auth.getSession()).data.session, null);
});

test("troca de senha só mexe na conta do token, exige 6 caracteres e encerra o primeiro acesso", async (t) => {
  process.env.SUPABASE_URL = "https://auth-test.example.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  const calls: Array<{ method: string; path: string; search: string; body: unknown }> = [];
  let firstAccess = true;

  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const text = await request.text();
    calls.push({ method: request.method, path: url.pathname, search: url.search, body: text ? JSON.parse(text) : null });
    let payload: unknown = null;
    if (url.pathname.endsWith("/truco_profiles") && request.method === "PATCH") firstAccess = (JSON.parse(text) as { must_change_password: boolean }).must_change_password;
    if (url.pathname.endsWith("/auth/v1/token")) {
      // Conferência da senha atual (cliente de login isolado).
      const ok = (JSON.parse(text) as { password: string }).password === "atual-certa";
      return new Response(JSON.stringify(ok
        ? { access_token: "t", refresh_token: "r", token_type: "bearer", expires_in: 3600, user: { id: "7b1d6c0e-52a4-4f0b-9a57-0c1f4e2d9a31", aud: "authenticated" } }
        : { error: "invalid_grant", error_description: "Invalid login credentials" }), { status: ok ? 200 : 400, headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname.includes("/auth/v1/admin/users/")) payload = { id: "7b1d6c0e-52a4-4f0b-9a57-0c1f4e2d9a31", email: "rafael@example.invalid" };
    else if (url.pathname.endsWith("/truco_profiles") && request.method === "GET") payload = { truco_id: "7b1d6c0e-52a4-4f0b-9a57-0c1f4e2d9a31", truco_player_id: "player-rafael", email: "rafael@example.invalid", role: "jogador", must_change_password: firstAccess };
    else if (url.pathname.endsWith("/truco_players")) payload = { name: "Rafael", avatar_url: null };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const { changePassword, passwordProblem, AuthError } = await import("./authService.js");

  assert.match(passwordProblem("12345") ?? "", /pelo menos 6/);
  assert.match(passwordProblem(" abcdef") ?? "", /espaço/);
  assert.equal(passwordProblem("abcdef"), null);

  // Senha curta é recusada antes de qualquer chamada ao Supabase.
  await assert.rejects(() => changePassword("7b1d6c0e-52a4-4f0b-9a57-0c1f4e2d9a31", "12345"), AuthError);
  assert.equal(calls.length, 0);

  const user = await changePassword("7b1d6c0e-52a4-4f0b-9a57-0c1f4e2d9a31", "nova-senha-1");
  assert.equal(user.mustChangePassword, false);
  const passwordUpdates = calls.filter((call) => call.path.includes("/auth/v1/admin/users/"));
  assert.deepEqual(passwordUpdates.map((call) => [call.method, call.path.split("/").pop(), call.body]), [["PUT", "7b1d6c0e-52a4-4f0b-9a57-0c1f4e2d9a31", { password: "nova-senha-1" }]]);
  const profileUpdates = calls.filter((call) => call.path.endsWith("/truco_profiles") && call.method === "PATCH");
  assert.deepEqual(profileUpdates.map((call) => [call.search, call.body]), [["?truco_id=eq.7b1d6c0e-52a4-4f0b-9a57-0c1f4e2d9a31", { must_change_password: false }]]);
  // Nenhuma busca de usuário por e-mail: a conta vem do token, não de um dado enviado pelo cliente.
  assert.equal(calls.some((call) => call.path.endsWith("/auth/v1/admin/users")), false);
  // No primeiro acesso não se pede a senha atual (a temporária acabou de ser usada no login).
  assert.equal(calls.some((call) => call.path.endsWith("/auth/v1/token")), false);

  // Fora do primeiro acesso: trocar exige a senha atual, conferida antes de qualquer alteração.
  firstAccess = false;
  calls.length = 0;
  await assert.rejects(() => changePassword("7b1d6c0e-52a4-4f0b-9a57-0c1f4e2d9a31", "outra-senha"), /senha atual não confere/);
  await assert.rejects(() => changePassword("7b1d6c0e-52a4-4f0b-9a57-0c1f4e2d9a31", "outra-senha", "chute"), /senha atual não confere/);
  assert.equal(calls.some((call) => call.path.includes("/auth/v1/admin/users/")), false, "senha atual errada: nada foi alterado");
  await changePassword("7b1d6c0e-52a4-4f0b-9a57-0c1f4e2d9a31", "outra-senha", "atual-certa");
  assert.deepEqual(calls.filter((call) => call.path.includes("/auth/v1/admin/users/")).map((call) => call.body), [{ password: "outra-senha" }]);
});
