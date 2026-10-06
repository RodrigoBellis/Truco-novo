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
