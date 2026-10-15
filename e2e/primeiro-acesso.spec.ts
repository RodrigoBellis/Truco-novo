import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Primeiro acesso da 5ª edição pelo navegador real, contra o backend em MODO HOMOLOGAÇÃO
 * (PostgreSQL local, schema real com as migrations). Só roda pela configuração de homologação:
 *   npm run test:homologacao -- --project=chromium (ou mobile-chromium)
 *
 * Roteiro: o administrador reinicia o acesso dos 14 → cada jogador escolhe a carta e cria a
 * senha → sai, entra com a senha e recarrega → a senha antiga não vale → o administrador
 * acompanha "X de 14" e redefine um acesso.
 */
const API = "http://localhost:3101";
test.describe.configure({ mode: "serial" });

let api: APIRequestContext;
let enabled = false;
let adminToken = "";
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

test("1. o administrador reinicia o acesso dos 14 pela tela e acompanha 0 de 14", async ({ page }) => {
  expect((await api.post("/api/rehearsal/reset")).status()).toBe(204);
  const status = (await (await api.get("/api/rehearsal/status")).json()) as { password: string; accounts: Array<{ playerId: string; name: string; role: string }> };
  accounts.push(...status.accounts.filter((account) => account.role === "jogador"));
  expect(accounts).toHaveLength(14);
  adminToken = (await (await api.post("/api/auth/login", { data: { email: "admin@trucodonovo.com", password: status.password } })).json()).token;

  await page.goto("/login");
  await page.getByRole("button", { name: "Área administrativa" }).click();
  await page.getByLabel("Senha").fill(status.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin/);
  await page.goto("/admin/jogadores");
  await expect(page.locator(".access-summary-count")).toHaveText("14 de 14");
  await page.getByRole("button", { name: "Reiniciar acesso de todos" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reiniciar todos" }).click();
  await expect(page.locator(".toast-success").filter({ hasText: "Acesso reiniciado para 14 jogadores" })).toBeVisible();
  await expect(page.locator(".access-summary-count")).toHaveText("0 de 14");
  await expect(page.getByText("Aguardando criação de senha")).toHaveCount(14);
});

test("2. o jogador escolhe a carta, cria a senha e entra; sai, entra com a senha e recarrega", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.startsWith("mobile");
  const player = accounts[0];
  await pickCard(page, player.name);
  await expect(page.getByRole("heading", { name: "Crie sua senha para a 5ª Edição" })).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveCount(0);
  const form = page.getByRole("form", { name: "Crie sua senha" });
  await form.getByLabel("Nova senha").fill("minha-senha-5");
  await form.getByLabel("Repita a senha").fill("outra-coisa");
  await expect(form.getByText("As duas senhas não são iguais.")).toBeVisible();
  await expect(form.getByRole("button", { name: "Criar senha e entrar" })).toBeDisabled();
  await form.getByLabel("Repita a senha").fill("minha-senha-5");
  await form.getByRole("button", { name: "Criar senha e entrar" }).click();
  await expect(page.locator(".toast-success").filter({ hasText: "Senha criada!" })).toBeVisible();
  await expect(page).toHaveURL(/\/(abertura|inicio)$/);
  await page.reload();
  await expect(page).not.toHaveURL(/\/login/);
  if (page.url().endsWith("/abertura")) await page.getByRole("button", { name: /Entrar na edição atual/ }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await logout(page, mobile);

  // Próxima entrada: a carta pede a senha criada; senha errada é recusada.
  await pickCard(page, player.name);
  await expect(page.getByRole("heading", { name: "Crie sua senha para a 5ª Edição" })).toHaveCount(0);
  await page.getByLabel("Senha").fill("ensaio-2026");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator(".login-error")).toBeVisible();
  await page.getByLabel("Senha").fill("minha-senha-5");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("3. a carta de quem já criou a senha não aceita novo cadastro, nem pela API", async ({ page, browser }) => {
  const player = accounts[0];
  const again = await api.post("/api/auth/first-access", { data: { playerId: player.playerId, newPassword: "tentando-de-novo" } });
  expect([again.status(), (await again.json()).code]).toEqual([409, "already_configured"]);
  // Dois aparelhos criando a senha da mesma carta: o segundo vê "já criou a senha" e cai na tela de senha.
  // Contexto separado: no mesmo navegador, a sessão criada numa aba entra em todas.
  const second = accounts[1];
  const otherDevice = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const [tabA, tabB] = [page, await otherDevice.newPage()];
  for (const tab of [tabA, tabB]) {
    await pickCard(tab, second.name);
    const form = tab.getByRole("form", { name: "Crie sua senha" });
    await form.getByLabel("Nova senha").fill(tab === tabA ? "senha-da-aba-a" : "senha-da-aba-b");
    await form.getByLabel("Repita a senha").fill(tab === tabA ? "senha-da-aba-a" : "senha-da-aba-b");
  }
  // Aba em segundo plano não anima: sem trazê-la para frente o clique espera para sempre.
  await tabA.bringToFront();
  await tabA.getByRole("button", { name: "Criar senha e entrar" }).click();
  await expect(tabA).not.toHaveURL(/\/login/);
  await tabB.bringToFront();
  await tabB.getByRole("button", { name: "Criar senha e entrar" }).click();
  await expect(tabB.locator(".login-error")).toContainText("já criou a senha");
  await expect(tabB.getByLabel("Senha")).toBeVisible();
  await otherDevice.close();
});

test("4. o administrador acompanha quem já criou a senha e redefine um acesso", async ({ page }) => {
  // Os outros 12 criam a senha pela API (o fluxo da tela já foi coberto acima).
  for (const account of accounts.slice(2)) {
    const reply = await api.post("/api/auth/first-access", { data: { playerId: account.playerId, newPassword: "senha-" + account.playerId.slice(0, 8) } });
    expect(reply.status()).toBe(200);
  }
  await page.goto("/login");
  await page.getByRole("button", { name: "Área administrativa" }).click();
  await page.getByLabel("Senha").fill("ensaio-2026");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin/);
  await page.goto("/admin/jogadores");
  await expect(page.locator(".access-summary-count")).toHaveText("14 de 14");
  const row = page.getByRole("row", { name: new RegExp("^" + accounts[0].name + " ") });
  await expect(row).toContainText("Senha criada");
  await row.getByRole("button", { name: "Redefinir acesso" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Redefinir acesso" }).click();
  await expect(page.locator(".access-summary-count")).toHaveText("13 de 14");
  await expect(row).toContainText("Aguardando criação de senha");
  // A senha que o jogador tinha deixou de valer.
  const old = await api.post("/api/auth/login", { data: { playerId: accounts[0].playerId, password: "minha-senha-5" } });
  expect(old.status()).toBe(400);
  expect(adminToken).not.toBe("");
});
