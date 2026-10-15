import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Entrada da 5ª edição com senha fixa (decisão de 15/10/2026), pelo navegador real, contra o
 * backend em MODO HOMOLOGAÇÃO (PostgreSQL local, schema real com as migrations). Só roda pela
 * configuração de homologação:
 *   npm run test:homologacao -- --project=chromium (ou mobile-chromium)
 *
 * Roteiro: o administrador entra só com a senha e grava a senha fixa dos 14 → cada jogador
 * escolhe a carta e entra com "Truco" + nome da carta → sai, entra de novo e recarrega → o
 * administrador redefine um acesso e a sessão antiga cai.
 */
const API = "http://localhost:3101";
test.describe.configure({ mode: "serial" });

const fixedPassword = (name: string) => "Truco" + name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]/g, "");

let api: APIRequestContext;
let enabled = false;
let adminPassword = "";
const accounts: Array<{ playerId: string; name: string }> = [];

test.beforeAll(async ({}, testInfo) => {
  enabled = Boolean((testInfo.config.metadata as { homologation?: boolean }).homologation);
  if (!enabled) return;
  api = await playwrightRequest.newContext({ baseURL: API });
});
test.beforeEach(() => test.skip(!enabled, "Só roda com playwright.homologacao.config.ts."));
test.afterAll(async () => { if (enabled) await api.dispose(); });

async function pickCard(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Ver lista de nomes" }).click();
  await page.getByLabel("Buscar jogador pelo nome").fill(name);
  await page.locator(".profile-card").filter({ has: page.locator(".profile-name", { hasText: new RegExp("^" + name + "$") }) }).click();
}

async function logout(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole("button", { name: "Mais" }).click();
    await page.locator(".more-sheet-logout").click();
  } else {
    await page.locator(".sidebar-logout").click();
  }
  await expect(page).toHaveURL(/\/login/);
}

async function adminScreenLogin(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Área administrativa" }).click();
  await expect(page.getByRole("textbox", { name: /e-mail/i })).toHaveCount(0);
  await page.getByLabel("Senha do administrador").fill(adminPassword);
  await page.getByRole("button", { name: "Entrar como administrador" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

test("1. o administrador entra só com a senha e grava a senha fixa dos 14", async ({ page }) => {
  expect((await api.post("/api/rehearsal/reset")).status()).toBe(204);
  const status = (await (await api.get("/api/rehearsal/status")).json()) as { password: string; accounts: Array<{ playerId: string; name: string; role: string }> };
  accounts.push(...status.accounts.filter((account) => account.role === "jogador"));
  expect(accounts).toHaveLength(14);
  adminPassword = status.password;

  await adminScreenLogin(page);
  await page.goto("/admin/jogadores");
  await page.getByRole("button", { name: "Gravar senha fixa de todos" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Gravar para todos" }).click();
  await expect(page.locator(".toast-success").filter({ hasText: "Senha fixa gravada para 14 jogadores" })).toBeVisible();
  await expect(page.locator(".access-summary-count")).toHaveText("14 de 14");
  await expect(page.getByText("Senha fixa ativa")).toHaveCount(14);
});

test("2. o jogador escolhe a carta e entra com a senha fixa; sai, entra de novo e recarrega", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.startsWith("mobile");
  const player = accounts[0];
  await pickCard(page, player.name);
  await expect(page.getByText(/Crie sua senha/)).toHaveCount(0);
  await page.getByLabel("Senha").fill(fixedPassword(player.name) + "x");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator(".login-error")).toBeVisible();
  await page.getByLabel("Senha").fill(fixedPassword(player.name));
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/(abertura|inicio)$/);
  await page.reload();
  await expect(page).not.toHaveURL(/\/login/);
  if (page.url().endsWith("/abertura")) await page.getByRole("button", { name: /Entrar na edição atual/ }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await logout(page, mobile);

  await pickCard(page, player.name);
  await page.getByLabel("Senha").fill(fixedPassword(player.name));
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("3. os 14 entram com a própria senha fixa e nenhum entra com a de outro", async () => {
  for (const [index, account] of accounts.entries()) {
    const ok = await api.post("/api/auth/login", { data: { playerId: account.playerId, password: fixedPassword(account.name) } });
    expect(ok.status(), account.name).toBe(200);
    expect((await ok.json()).user.mustChangePassword).toBe(false);
    const other = accounts[(index + 1) % accounts.length];
    expect((await api.post("/api/auth/login", { data: { playerId: account.playerId, password: fixedPassword(other.name) } })).status()).toBe(400);
  }
  expect((await api.post("/api/auth/first-access", { data: { playerId: accounts[0].playerId, newPassword: "qualquer-uma" } })).status()).toBe(404);
});

test("4. redefinir acesso derruba a sessão aberta e a senha fixa continua a mesma", async ({ page }) => {
  const player = accounts[1];
  const before = (await (await api.post("/api/auth/login", { data: { playerId: player.playerId, password: fixedPassword(player.name) } })).json()).token as string;
  expect((await api.get("/api/matches", { headers: { Authorization: "Bearer " + before } })).status()).toBe(200);
  await adminScreenLogin(page);
  await page.goto("/admin/jogadores");
  const row = page.getByRole("row", { name: new RegExp("^" + player.name + " ") });
  await row.getByRole("button", { name: "Redefinir acesso" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Redefinir acesso" }).click();
  await expect(page.locator(".toast-success").filter({ hasText: player.name })).toBeVisible();
  expect((await api.get("/api/matches", { headers: { Authorization: "Bearer " + before } })).status()).toBe(401);
  expect((await api.post("/api/auth/login", { data: { playerId: player.playerId, password: fixedPassword(player.name) } })).status()).toBe(200);
});
