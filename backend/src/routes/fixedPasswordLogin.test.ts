import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

/**
 * Entrada da 5ª edição desde 15/10/2026: senha fixa por jogador ("Truco" + nome da carta) e
 * administrador só com a senha. API real em MODO ENSAIO, sem nenhuma chamada externa.
 */
process.env.TRUCO_REHEARSAL = "1";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TRUCO_ADMIN_EMAIL;

const { createApp } = await import("../app.js");
const { REHEARSAL_PASSWORD, rehearsalStore } = await import("../data/rehearsalStore.js");
const { fixedPasswordFor, resetAccessRateLimits } = await import("../services/accessService.js");

let server: Server;
let base = "";

async function post(path: string, payload: unknown, token?: string) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const json = response.headers.get("content-type")?.includes("json");
  return { status: response.status, body: json && text ? JSON.parse(text) : null, raw: text };
}

async function get(path: string, token?: string) {
  const response = await fetch(base + path, { headers: token ? { Authorization: "Bearer " + token } : {} });
  return { status: response.status };
}

before(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

test("senha fixa: Truco + nome da carta, sem espaços nem acentos", () => {
  const expected: Record<string, string> = {
    Diguinho: "TrucoDiguinho", "Digão": "TrucoDigao", Pigas: "TrucoPigas", Rodrigo: "TrucoRodrigo", Rafinha: "TrucoRafinha",
    "Rogério": "TrucoRogerio", JP: "TrucoJP", PG: "TrucoPG", Anderson: "TrucoAnderson", Saulo: "TrucoSaulo",
    Vitor: "TrucoVitor", Alexandre: "TrucoAlexandre", Waguinho: "TrucoWaguinho", Ronaldo: "TrucoRonaldo",
  };
  for (const [name, password] of Object.entries(expected)) assert.equal(fixedPasswordFor(name), password, name);
  assert.equal(fixedPasswordFor("Zé da Silva"), "TrucoZedaSilva");
});

test("administrador entra só com a senha; a resposta não traz senha e a rota admin abre", async () => {
  resetAccessRateLimits();
  const wrong = await post("/api/auth/admin-login", { password: "errada" });
  assert.equal(wrong.status, 400);
  const ok = await post("/api/auth/admin-login", { password: REHEARSAL_PASSWORD });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, "superadmin");
  assert.ok(!ok.raw.includes(REHEARSAL_PASSWORD), "a resposta não pode conter a senha");
  assert.equal((await get("/api/admin/players/access", ok.body.token)).status, 200);
  assert.equal((await get("/api/admin/players/access")).status, 401);
});

test("jogador não entra pelo login do administrador nem abre rota administrativa", async () => {
  resetAccessRateLimits();
  const account = rehearsalStore().accounts().find((item) => item.role === "jogador")!;
  const login = await post("/api/auth/login", { playerId: account.playerId, password: REHEARSAL_PASSWORD });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.mustChangePassword, false);
  assert.equal((await get("/api/admin/players/access", login.body.token)).status, 403);
  assert.equal((await post("/api/auth/first-access", { playerId: account.playerId, newPassword: "qualquer" })).status, 404);
});

test("limite de tentativas: 5 recusas bloqueiam a conta com 429, mesmo com a senha certa", async () => {
  resetAccessRateLimits();
  const account = rehearsalStore().accounts().find((item) => item.role === "jogador")!;
  for (let i = 0; i < 5; i += 1) assert.equal((await post("/api/auth/login", { playerId: account.playerId, password: "errada" })).status, 400);
  assert.equal((await post("/api/auth/login", { playerId: account.playerId, password: REHEARSAL_PASSWORD })).status, 429);
  for (let i = 0; i < 5; i += 1) await post("/api/auth/admin-login", { password: "errada" });
  assert.equal((await post("/api/auth/admin-login", { password: REHEARSAL_PASSWORD })).status, 429);
  resetAccessRateLimits();
  assert.equal((await post("/api/auth/admin-login", { password: REHEARSAL_PASSWORD })).status, 200);
});
