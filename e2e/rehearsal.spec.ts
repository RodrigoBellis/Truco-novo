import { expect, request as playwrightRequest, test, type APIRequestContext, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";

/**
 * Simulação completa do campeonato pelo navegador, com os botões reais, contra o backend em
 * MODO ENSAIO (dados fictícios em memória, sem Supabase). Só roda pela configuração própria:
 *   npm run test:rehearsal
 * Na suíte padrão (playwright.config.ts) este arquivo é pulado.
 *
 * Os placares são sempre lançados pela interface. A API direta serve só para preparar o
 * estado (reset), obter sessões e conferir o resultado por um caminho independente.
 */
const API = "http://localhost:3101";
const PASSWORD = "ensaio-2026";
// Ids citados pelo roteiro; /api/rehearsal/status devolve os do ambiente (UUIDs na homologação).
let ADMIN = "ensaio-admin";
let FIRST_PLAYER = "ensaio-jogador-01";
let TEAM_A1 = "ensaio-dupla-a1";

test.describe.configure({ mode: "serial" });

type GroupId = "A";
interface Score { setsA: number; setsB: number }
interface Team { id: string; name: string; player1Id: string; player2Id: string; groupId: GroupId }
interface Match { id: string; stage: string; round: string; order: number; groupId: GroupId | null; teamAId: string; teamBId: string; result: Score | null; status: string; queuePosition: number | null }
interface BracketRow { id: string; round: string; order: number; label: string; matchId: string | null }
interface StandingRow { teamId: string; position: number }
interface Session { user: { id: string; name: string; teamId: string | null }; token: string; refreshToken: string }

let api: APIRequestContext;
let rehearsal = false;
let mobile = false;
let teams: Team[] = [];
let groupMatches: Match[] = [];
const sessions = new Map<string, Session>();
const playerNames = new Map<string, string>();
/** Placares que este roteiro gravou pela interface: base do cálculo independente. */
const ledger = new Map<string, Score>();
const openPages = new Set<Page>();
const externalHosts = new Set<string>();
const rehearsalPaths = new Set<string>();
const counters = { uiFirstLaunches: 0, uiEdits: 0, screenLogins: 0, logouts: 0 };
const launchedMatchIds = new Set<string>();

// ---------- Infraestrutura ----------

test.beforeAll(async ({}, testInfo) => {
  rehearsal = Boolean((testInfo.config.metadata as { rehearsal?: boolean }).rehearsal);
  if (!rehearsal) return;
  mobile = testInfo.project.name.startsWith("mobile");
  api = await playwrightRequest.newContext({ baseURL: API });
});

test.beforeEach(({}, testInfo) => {
  test.skip(!rehearsal, "Só roda com playwright.rehearsal.config.ts (npm run test:rehearsal).");
  testInfo.setTimeout(mobile ? 420_000 : 600_000);
});

test.afterEach(async ({}, testInfo) => {
  if (!rehearsal) return;
  if (testInfo.status !== testInfo.expectedStatus) {
    let index = 0;
    for (const page of openPages) {
      if (!page.isClosed()) await page.screenshot({ path: testInfo.outputPath(`falha-${(index += 1)}.png`), fullPage: true }).catch(() => undefined);
    }
  }
  for (const page of openPages) await page.context().close().catch(() => undefined);
  openPages.clear();
  // Nenhuma requisição do navegador pode sair para o Supabase real.
  expect([...externalHosts].filter((host) => host.endsWith("supabase.co") || host.endsWith("supabase.in")), "requisições ao Supabase real").toEqual([]);
});

test.afterAll(async () => {
  if (!rehearsal) return;
  console.log(`[ensaio] placares lançados pela interface: ${counters.uiFirstLaunches} primeiros lançamentos + ${counters.uiEdits} correções; logins pela tela: ${counters.screenLogins}; saídas pela tela: ${counters.logouts}; hosts externos: ${[...externalHosts].join(", ") || "nenhum"}`);
  await api.dispose();
});

async function apiCall<T = any>(method: "GET" | "POST", path: string, playerId: string | null = ADMIN, data?: unknown): Promise<{ status: number; body: T }> {
  const token = playerId ? sessions.get(playerId)?.token : undefined;
  const response = await api.fetch(path, { method, data, headers: token ? { Authorization: "Bearer " + token } : {} });
  const text = await response.text();
  return { status: response.status(), body: (text ? JSON.parse(text) : null) as T };
}

async function newPage(browser: Browser, testInfo: TestInfo, playerId: string | null): Promise<Page> {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (url.hostname === "localhost" && url.port === "3101") rehearsalPaths.add(url.pathname.split("/").slice(0, 3).join("/"));
    else if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") externalHosts.add(url.hostname);
  });
  if (playerId) {
    const session = sessions.get(playerId)!;
    // Sessão gravada direto (sem a tela de login) e abertura já vista, para ir direto à página.
    await context.addInitScript((stored) => {
      if (!localStorage.getItem("truco-do-novo:session")) localStorage.setItem("truco-do-novo:session", JSON.stringify(stored));
      sessionStorage.setItem("truco-opening:" + stored.user.id, "seen");
    }, session);
  }
  const page = await context.newPage();
  openPages.add(page);
  return page;
}

async function openAs(browser: Browser, testInfo: TestInfo, playerId: string, path: string): Promise<Page> {
  const page = await newPage(browser, testInfo, playerId);
  await page.goto(path);
  return page;
}

async function closePage(page: Page): Promise<void> {
  openPages.delete(page);
  await page.context().close();
}

/** Login pela TELA real: lista de nomes → senha → Entrar (ou "Área administrativa" para o admin). */
async function screenLogin(page: Page, playerId: string): Promise<void> {
  await page.goto("/login");
  if (playerId === ADMIN) {
    await page.getByRole("button", { name: "Área administrativa" }).click();
  } else {
    const name = playerNames.get(playerId)!;
    await page.getByRole("button", { name: "Ver lista de nomes" }).click();
    await page.getByLabel("Buscar jogador pelo nome").fill(name);
    await page.locator(".profile-card").filter({ has: page.locator(".profile-name", { hasText: new RegExp("^" + name + "$") }) }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: playerId === ADMIN ? "Entrar como administrador" : "Entrar", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  counters.screenLogins += 1;
}

async function screenLogout(page: Page): Promise<void> {
  if (mobile) {
    await page.getByRole("button", { name: "Mais" }).click();
    await page.locator(".more-sheet-logout").click();
  } else {
    await page.locator(".sidebar-logout").click();
  }
  await expect(page).toHaveURL(/\/login/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("truco-do-novo:session"))).toBeNull();
  counters.logouts += 1;
}

// ---------- Apoio de domínio ----------

const team = (teamId: string) => teams.find((item) => item.id === teamId)!;
const playersOf = (teamId: string) => [team(teamId).player1Id, team(teamId).player2Id];
/** Ordem pelo nome fictício: "Jogador 1 & Jogador 2" é a dupla 1, "Jogador 13 & Jogador 14" a dupla 7. */
const seedOf = (teamId: string) => (Number(/\d+/.exec(team(teamId).name)![0]) + 1) / 2;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (text: string) => new RegExp("^" + escapeRegExp(text) + "$");
/** Placar com `winner` vencendo e o perdedor fazendo `loserSets` quedas. */
const scoreFor = (match: Pick<Match, "teamAId">, winner: string, loserSets = 0): Score => (match.teamAId === winner ? { setsA: 2, setsB: loserSets } : { setsA: loserSets, setsB: 2 });
const favourite = (match: Match) => (seedOf(match.teamAId) < seedOf(match.teamBId) ? match.teamAId : match.teamBId);
const label = (score: Score) => `${score.setsA}x${score.setsB}`;

const resultButtons = (scope: Page | Locator) => scope.getByRole("button", { name: /Lançar resultado|Editar resultado/ });
const campaignPanel = (page: Page) => page.getByRole("region", { name: "Sua dupla no mata-mata" });
const toast = (page: Page, kind: "success" | "error", text: string | RegExp) => page.locator(".toast-" + kind).filter({ hasText: text }).last();

/** Card de um jogo na tela Jogos, pelas duas duplas. */
function matchCard(page: Page, match: Pick<Match, "teamAId" | "teamBId">): Locator {
  const named = (teamId: string) => page.locator(".round-team-name", { hasText: exact(team(teamId).name) });
  return page.locator(".round-match").filter({ has: named(match.teamAId) }).filter({ has: named(match.teamBId) });
}
const koCard = (page: Page, key: string) => page.locator(".ko-cell-" + key);

/** Abre o formulário do jogo e escolhe o placar; devolve o que falta clicar para salvar. */
async function prepareScore(page: Page, scope: Locator, score: Score): Promise<{ editing: boolean; submit: () => Promise<void> }> {
  const button = resultButtons(scope);
  await expect(button).toHaveCount(1);
  const editing = ((await button.textContent()) ?? "").includes("Editar");
  await button.click();
  await scope.getByRole("button", { name: label(score), exact: true }).click();
  const confirm = scope.getByRole("button", { name: editing ? "Salvar correção" : "Confirmar resultado" });
  await expect(confirm).toBeEnabled();
  return {
    editing,
    submit: async () => {
      await confirm.click();
      // Corrigir um placar já lançado pede confirmação.
      if (editing) await page.getByRole("alertdialog").getByRole("button", { name: "Salvar correção" }).click();
    },
  };
}

function recordSaved(matchId: string, score: Score, editing: boolean): void {
  ledger.set(matchId, score);
  if (editing || launchedMatchIds.has(matchId)) counters.uiEdits += 1;
  else counters.uiFirstLaunches += 1;
  launchedMatchIds.add(matchId);
}

/** Lança ou corrige um placar pelos botões e espera a tela confirmar. */
async function saveScore(page: Page, scope: Locator, matchId: string, score: Score, successText?: string | RegExp): Promise<void> {
  const form = await prepareScore(page, scope, score);
  await form.submit();
  await expect(toast(page, "success", successText ?? /Resultado/)).toBeVisible();
  recordSaved(matchId, score, form.editing);
}

/** Tenta salvar e espera a recusa da API aparecer na tela. */
async function saveRefused(page: Page, scope: Locator, score: Score, message: RegExp): Promise<void> {
  const form = await prepareScore(page, scope, score);
  await form.submit();
  await expect(toast(page, "error", message)).toBeVisible();
}

/** Tabela calculada só a partir dos placares que o roteiro lançou. */
function expectedTable(): Record<string, { j: number; v: number; x20: number; d: number; saldo: number; pts: number }> {
  const table: ReturnType<typeof expectedTable> = {};
  for (const item of teams) {
    const row = { j: 0, v: 0, x20: 0, d: 0, saldo: 0, pts: 0 };
    for (const match of groupMatches) {
      const score = ledger.get(match.id);
      if (!score || (match.teamAId !== item.id && match.teamBId !== item.id)) continue;
      const mine = match.teamAId === item.id ? score.setsA : score.setsB;
      const theirs = match.teamAId === item.id ? score.setsB : score.setsA;
      row.j += 1;
      row.saldo += mine - theirs;
      if (mine > theirs) { row.v += 1; row.pts += theirs === 0 ? 3 : 2; if (theirs === 0) row.x20 += 1; } else { row.d += 1; row.pts += mine === 1 ? 1 : 0; }
    }
    table[item.name] = row;
  }
  return table;
}

/** Lê a tabela da tela Grupos e confere pontos, vitórias, saldo e posição contra o cálculo independente. */
async function checkStandingsOnScreen(page: Page): Promise<void> {
  await page.goto("/grupos");
  await expect(page.getByRole("heading", { name: "Grupo Único", exact: true })).toBeVisible();
  const read = async () => page.locator(".standings-row").evaluateAll((elements) => elements.map((element) => {
    const cells = [...element.querySelectorAll("td")].map((cell) => cell.textContent ?? "");
    const name = [...(element.querySelector(".standings-team-name")?.childNodes ?? [])].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join("").trim();
    return { position: cells[0].trim(), name, j: Number(cells[2]), v: Number(cells[3]), x20: Number(cells[4]), d: Number(cells[5]), saldo: Number(cells[6]), pts: Number(cells[8]) };
  }));
  await expect.poll(async () => Object.fromEntries((await read()).map(({ name, position: _position, ...stats }) => [name, stats])), { message: "classificação do grupo único na tela" }).toEqual(expectedTable());
  const rows = await read();
  expect(rows.map((row) => row.position)).toEqual(["1º", "2º", "3º", "4º", "5º", "6º", "7º"]);
  for (let index = 1; index < rows.length; index += 1) {
    const [above, below] = [rows[index - 1], rows[index]];
    expect(above.pts - below.pts || above.v - below.v || above.x20 - below.x20, `${above.name} acima de ${below.name}`).toBeGreaterThanOrEqual(0);
  }
}

const bracketRows = async () => (await apiCall<BracketRow[]>("GET", "/api/bracket")).body;
const knockoutMatches = async () => (await apiCall<Match[]>("GET", "/api/matches?stage=mata-mata")).body;
const ROUND = { Q: "Quartas de final", S: "Semifinal", T: "Disputa de 3º lugar", F: "Final" } as const;
async function ko(key: string): Promise<Match> {
  const match = (await knockoutMatches()).find((item) => item.round === ROUND[key[0] as keyof typeof ROUND] && item.order === (key.length > 1 ? Number(key[1]) - 1 : 0));
  expect(match, "jogo " + key + " deveria existir").toBeTruthy();
  return match!;
}

/** Seis confrontos distintos, no máximo um jogo por confronto, todos vinculados. */
async function expectKnockoutIntegrity(expectedMatches: number): Promise<void> {
  const rows = await bracketRows();
  const games = await knockoutMatches();
  expect(rows.length).toBe(6);
  expect(new Set(rows.map((row) => row.round + "#" + row.order)).size).toBe(6);
  expect(games.length).toBe(expectedMatches);
  expect(new Set(games.map((game) => game.round + "#" + game.order)).size).toBe(games.length);
  expect(rows.flatMap((row) => (row.matchId ? [row.matchId] : [])).sort()).toEqual(games.map((game) => game.id).sort());
}

async function seeded(position: number): Promise<string> {
  return (await apiCall<StandingRow[]>("GET", "/api/groups/A/standings")).body.find((row) => row.position === position)!.teamId;
}

/** Abre Mata-mata como `playerId` e lança/corrige o jogo `key` no próprio chaveamento. */
async function launchKnockout(browser: Browser, testInfo: TestInfo, playerId: string, key: string, score: Score, successText: string | RegExp, after?: (page: Page) => Promise<void>): Promise<void> {
  const match = await ko(key);
  const page = await openAs(browser, testInfo, playerId, "/mata-mata");
  await saveScore(page, koCard(page, key), match.id, score, successText);
  if (after) await after(page);
  await closePage(page);
}

// ---------- Roteiro ----------

test("1. cadeado: jogador sem botão e API recusando; o administrador libera pela tela; os botões aparecem", async ({ browser }, testInfo) => {
  expect((await api.post("/api/rehearsal/reset")).status()).toBe(204);
  const status = (await (await api.get("/api/rehearsal/status")).json()) as { ids?: { admin: string; firstPlayer: string; teamA1: string }; accounts: Array<{ playerId: string; name: string }> };
  if (status.ids) [ADMIN, FIRST_PLAYER, TEAM_A1] = [status.ids.admin, status.ids.firstPlayer, status.ids.teamA1];
  for (const account of status.accounts) {
    const login = await api.post("/api/auth/login", { data: { playerId: account.playerId, password: PASSWORD } });
    sessions.set(account.playerId, (await login.json()) as Session);
    playerNames.set(account.playerId, account.name);
  }
  teams = (await apiCall<Team[]>("GET", "/api/teams")).body;
  groupMatches = (await apiCall<Match[]>("GET", "/api/matches?stage=grupos")).body;
  expect([teams.length, groupMatches.length]).toEqual([7, 21]);
  ledger.clear();
  launchedMatchIds.clear();

  const player = FIRST_PLAYER;
  const page = await newPage(browser, testInfo, null);
  await screenLogin(page, player);
  await page.goto("/jogos");
  await expect(page.locator(".round-match")).toHaveCount(6);
  await expect(page.locator(".results-lock-notice")).toBeVisible();
  await expect(resultButtons(page)).toHaveCount(0);
  const mine = groupMatches.find((match) => match.teamAId === TEAM_A1 || match.teamBId === TEAM_A1)!;
  const refused = await apiCall("POST", `/api/matches/${mine.id}/result`, player, { setsA: 2, setsB: 0 });
  expect([refused.status, refused.body.code]).toEqual([403, "results_locked"]);

  // Troca de usuário pela tela: sai o jogador, entra o administrador, que só abre o cadeado.
  await screenLogout(page);
  await screenLogin(page, ADMIN);
  await expect(page).toHaveURL(/\/admin/);
  const lock = page.getByRole("region", { name: "Lançamento de resultados" });
  await expect(lock.locator(".results-lock-state")).toHaveText("Bloqueado");
  await lock.getByRole("button", { name: "Liberar resultados" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Liberar", exact: true }).click();
  await expect(lock.locator(".results-lock-state")).toHaveText("Liberado");
  expect((await apiCall("GET", "/api/matches/lock")).body).toEqual({ locked: false });
  await screenLogout(page);

  await screenLogin(page, player);
  await page.goto("/jogos");
  await expect(resultButtons(page)).toHaveCount(6);
  await expect(page.locator(".results-lock-notice")).toHaveCount(0);
  await page.reload();
  await expect(resultButtons(page)).toHaveCount(6);

  // O navegador fala com o ensaio também no que seria o Supabase (sessão).
  expect([...rehearsalPaths]).toEqual(expect.arrayContaining(["/auth/v1", "/api/auth", "/api/matches"]));
});

test("2. fase de grupos pelos botões: ordem embaralhada, edições, simultaneidade, falha de conexão; com 20 jogos não há mata-mata", async ({ browser }, testInfo) => {
  // Ordem: embaralha com semente fixa e põe o jogo de MAIOR ordem primeiro.
  let seed = 20261025;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const shuffled = (list: Match[]) => { const copy = [...list]; for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };
  const highest = Math.max(...groupMatches.map((match) => match.order));
  const order = shuffled(groupMatches).sort((a, b) => Number(b.order === highest) - Number(a.order === highest));
  expect(order[0].order).toBe(highest);
  const poster = (match: Match, index: number) => [...playersOf(match.teamAId), ...playersOf(match.teamBId)][index % 4];
  const planned = (match: Match, index: number) => scoreFor(match, favourite(match), index % 3 === 0 ? 1 : 0);

  // --- Jogo 1 (o de maior ordem): lançar, editar várias vezes, conferir a tabela a cada alteração.
  const first = order[0];
  const [a1, a2] = playersOf(first.teamAId);
  const [b1] = playersOf(first.teamBId);
  let page = await openAs(browser, testInfo, a1, "/jogos");
  await saveScore(page, matchCard(page, first), first.id, { setsA: 2, setsB: 0 }, "Resultado registrado! A classificação do seu grupo já foi atualizada.");
  await expect(matchCard(page, first).locator(".round-team-sets")).toHaveText(["2", "0"]);
  await checkStandingsOnScreen(page);
  const lowest = groupMatches.find((match) => match.order === 0)!;
  expect((await apiCall<Match[]>("GET", "/api/matches?stage=grupos")).body.find((match) => match.id === lowest.id)!.status).toBe("pendente");
  await closePage(page);

  const edits: Array<[string, Score]> = mobile
    ? [[b1, { setsA: 1, setsB: 2 }]]
    : [[a2, { setsA: 2, setsB: 1 }], [b1, { setsA: 1, setsB: 2 }], [a1, { setsA: 0, setsB: 2 }]];
  for (const [editor, score] of edits) {
    page = await openAs(browser, testInfo, editor, "/jogos");
    await saveScore(page, matchCard(page, first), first.id, score, "Resultado atualizado com sucesso! A classificação já foi recalculada.");
    await expect(matchCard(page, first).locator(".round-team-sets")).toHaveText([String(score.setsA), String(score.setsB)]);
    await checkStandingsOnScreen(page);
    await closePage(page);
  }
  // O adversário (outra conta) vê o placar, e ele continua lá depois de recarregar.
  const current = ledger.get(first.id)!;
  page = await openAs(browser, testInfo, playersOf(first.teamBId)[1], "/jogos");
  await expect(matchCard(page, first).locator(".round-team-sets")).toHaveText([String(current.setsA), String(current.setsB)]);
  await page.reload();
  await expect(matchCard(page, first).locator(".round-team-sets")).toHaveText([String(current.setsA), String(current.setsB)]);
  await closePage(page);
  // Jogador de outra dupla enxerga o jogo, mas não tem botão nele.
  const outsider = teams.find((item) => item.id !== first.teamAId && item.id !== first.teamBId)!;
  page = await openAs(browser, testInfo, outsider.player1Id, "/jogos");
  await page.getByRole("tab", { name: "Todas as Rodadas" }).click();
  await expect(matchCard(page, first)).toHaveCount(1);
  await expect(matchCard(page, first).getByRole("button")).toHaveCount(0);
  await expect(matchCard(page, first).locator(".round-team-sets")).toHaveText([String(current.setsA), String(current.setsB)]);
  await closePage(page);
  // Volta ao placar planejado.
  page = await openAs(browser, testInfo, a2, "/jogos");
  await saveScore(page, matchCard(page, first), first.id, planned(first, 0), /Resultado atualizado/);
  await closePage(page);

  // --- Jogos 2 a 19.
  const lastTwo = order.slice(19);
  for (const [index, match] of order.entries()) {
    if (index === 0 || index >= 19) continue;
    const score = planned(match, index);

    if (index === 5) {
      // Os dois parceiros salvam o mesmo jogo no mesmo instante, com placares diferentes (mesmo vencedor).
      const [left, right] = await Promise.all(playersOf(match.teamAId).map((playerId) => openAs(browser, testInfo, playerId, "/jogos")));
      const options = [scoreFor(match, favourite(match), 0), scoreFor(match, favourite(match), 1)];
      const forms = [await prepareScore(left, matchCard(left, match), options[0]), await prepareScore(right, matchCard(right, match), options[1])];
      await Promise.all(forms.map((form) => form.submit()));
      await expect(toast(left, "success", /Resultado registrado/)).toBeVisible();
      await expect(toast(right, "success", /Resultado registrado/)).toBeVisible();
      const saved = (await apiCall<Match[]>("GET", "/api/matches?stage=grupos")).body.find((item) => item.id === match.id)!.result!;
      expect(options).toContainEqual(saved);
      recordSaved(match.id, saved, false);
      await checkStandingsOnScreen(left);
      await closePage(left);
      await closePage(right);
      continue;
    }

    if (index === 6) {
      // As duas duplas salvam o mesmo jogo no mesmo instante.
      const [left, right] = await Promise.all([playersOf(match.teamAId)[0], playersOf(match.teamBId)[1]].map((playerId) => openAs(browser, testInfo, playerId, "/jogos")));
      const forms = [await prepareScore(left, matchCard(left, match), score), await prepareScore(right, matchCard(right, match), score)];
      await Promise.all(forms.map((form) => form.submit()));
      await expect(toast(left, "success", /Resultado registrado/)).toBeVisible();
      await expect(toast(right, "success", /Resultado registrado/)).toBeVisible();
      recordSaved(match.id, score, false);
      await closePage(left);
      await closePage(right);
      continue;
    }

    page = await openAs(browser, testInfo, poster(match, index), "/jogos");
    if (index === 8) {
      // A resposta se perde depois da gravação: a tela consulta o placar sem reenviá-lo.
      await page.route("**/api/matches/*/result", async (route) => { await route.fetch(); await route.abort("connectionreset"); }, { times: 1 });
      const form = await prepareScore(page, matchCard(page, match), score);
      await form.submit();
      await expect(toast(page, "error", /não foi possível confirmar a gravação/)).toBeVisible();
      expect((await apiCall<Match[]>("GET", "/api/matches?stage=grupos")).body.find((item) => item.id === match.id)!.result).toEqual(score);
      await expect(matchCard(page, match).getByRole("button", { name: "Confirmar resultado" })).toHaveCount(0);
      await expect(matchCard(page, match).locator(".round-team-sets")).toHaveText([String(score.setsA), String(score.setsB)]);
      recordSaved(match.id, score, false);
      expect((await apiCall<Match[]>("GET", "/api/matches?stage=grupos")).body.length).toBe(21);
    } else {
      await saveScore(page, matchCard(page, match), match.id, score, /Resultado registrado/);
    }
    if (!mobile || index % 6 === 0) await checkStandingsOnScreen(page);
    await closePage(page);
  }

  // --- Com 19 (celular) ou 20 (desktop) jogos: nada de mata-mata.
  if (!mobile) {
    page = await openAs(browser, testInfo, poster(lastTwo[0], 19), "/jogos");
    await saveScore(page, matchCard(page, lastTwo[0]), lastTwo[0].id, planned(lastTwo[0], 19), /Resultado registrado/);
    await checkStandingsOnScreen(page);
    await closePage(page);
  }
  expect((await bracketRows()).length).toBe(0);
  expect((await knockoutMatches()).length).toBe(0);
  expect(ledger.size).toBe(mobile ? 19 : 20);
  // Tela Mata-mata de quem hoje está em 3º: quartas ainda não criadas, sem botão.
  page = await openAs(browser, testInfo, playersOf(await seeded(3))[0], "/mata-mata");
  await expect(koCard(page, "Q1")).toBeVisible();
  await expect(resultButtons(page)).toHaveCount(0);
  await expect(page.locator(".ko-match")).toHaveCount(6);
  await page.getByRole("link", { name: "Jogos" }).first().click().catch(() => page.goto("/jogos"));
  await page.goto("/jogos");
  await expect(page.getByRole("tab", { name: "Mata-mata" })).toHaveCount(0);
  await closePage(page);
});

test("3. o último jogo de grupo faz as quartas nascerem sozinhas; corrigir um placar de grupo refaz o chaveamento sem duplicar", async ({ browser }, testInfo) => {
  const pending = groupMatches.filter((match) => !ledger.has(match.id));
  expect(pending.length).toBe(mobile ? 2 : 1);

  if (mobile) {
    // Os dois últimos jogos da fase de grupos salvos no mesmo instante, por duplas diferentes.
    const pages = await Promise.all(pending.map((match, index) => openAs(browser, testInfo, playersOf(index ? match.teamBId : match.teamAId)[index], "/jogos")));
    const scores = pending.map((match) => scoreFor(match, favourite(match)));
    const forms = [await prepareScore(pages[0], matchCard(pages[0], pending[0]), scores[0]), await prepareScore(pages[1], matchCard(pages[1], pending[1]), scores[1])];
    await Promise.all(forms.map((form) => form.submit()));
    for (const [index, page] of pages.entries()) {
      await expect(toast(page, "success", /Resultado registrado/)).toBeVisible();
      recordSaved(pending[index].id, scores[index], false);
      await closePage(page);
    }
  } else {
    const match = pending[0];
    const page = await openAs(browser, testInfo, playersOf(match.teamBId)[1], "/jogos");
    await saveScore(page, matchCard(page, match), match.id, scoreFor(match, favourite(match)), /Resultado registrado/);
    await checkStandingsOnScreen(page);
    await closePage(page);
  }
  expect(ledger.size).toBe(21);

  // Sem nenhuma ação do administrador: chaveamento e as duas quartas existem.
  await expectKnockoutIntegrity(2);
  const third = await seeded(3);
  const fourth = await seeded(4);
  let q1 = await ko("Q1");
  expect([q1.teamAId, q1.teamBId]).toEqual([third, await seeded(6)]);
  const q2 = await ko("Q2");
  expect([q2.teamAId, q2.teamBId]).toEqual([fourth, await seeded(5)]);
  let page = await openAs(browser, testInfo, playersOf(third)[0], "/mata-mata");
  await expect(page.locator(".ko-match")).toHaveCount(6);
  await expect(resultButtons(koCard(page, "Q1"))).toHaveText("Lançar resultado");
  await expect(campaignPanel(page)).toContainText("Sua vez");
  await expect(koCard(page, "Q1").locator(".ko-side-team strong")).toHaveText([team(third).name, team(q1.teamBId).name]);
  await checkStandingsOnScreen(page);
  await closePage(page);

  // Correção de grupo antes de qualquer placar de mata-mata: o 4º passa a vencer o 3º.
  const duel = groupMatches.find((match) => [match.teamAId, match.teamBId].sort().join() === [third, fourth].sort().join())!;
  page = await openAs(browser, testInfo, playersOf(fourth)[1], "/jogos");
  await saveScore(page, matchCard(page, duel), duel.id, scoreFor(duel, fourth, 0), /Resultado atualizado/);
  await checkStandingsOnScreen(page);
  await expectKnockoutIntegrity(2);
  const newThird = await seeded(3);
  expect(newThird).not.toBe(third);
  q1 = await ko("Q1");
  expect(q1.teamAId).toBe(newThird);
  await page.goto("/mata-mata");
  await expect(page.locator(".ko-match")).toHaveCount(6);
  await expect(koCard(page, "Q1").locator(".ko-side-team strong").first()).toHaveText(team(newThird).name);
  await expect(resultButtons(page).first()).toBeVisible();
  await closePage(page);
});

test("4. mata-mata lançado no próprio chaveamento: avanço, despedida, espera, correções aceitas e recusadas, até o campeão e o 3º lugar", async ({ browser }, testInfo) => {
  const [p1, p2, p3, p4, p5, p6, p7] = await Promise.all([1, 2, 3, 4, 5, 6, 7].map((position) => seeded(position)));
  const name = (teamId: string) => team(teamId).name;

  // 1º e 2º colocados aguardam na semifinal: sem jogo, sem botão. O 7º terminou fora das vagas.
  let page = await openAs(browser, testInfo, playersOf(p1)[0], "/mata-mata");
  await expect(campaignPanel(page)).toContainText("Vocês aguardam o vencedor das Quartas 2, na Semifinal 1.");
  await expect(resultButtons(page)).toHaveCount(0);
  await closePage(page);
  page = await openAs(browser, testInfo, playersOf(p2)[1], "/mata-mata");
  await expect(campaignPanel(page)).toContainText("Vocês aguardam o vencedor das Quartas 1, na Semifinal 2.");
  await expect(resultButtons(page)).toHaveCount(0);
  await closePage(page);
  page = await openAs(browser, testInfo, playersOf(p7)[0], "/mata-mata");
  await expect(campaignPanel(page)).toContainText("Fim da campanha nesta edição");
  await expect(resultButtons(page)).toHaveCount(0);
  await closePage(page);

  // --- Quartas 1 (3º × 6º): um integrante lança, a tela mostra o avanço e ele persiste.
  let q1 = await ko("Q1");
  await launchKnockout(browser, testInfo, playersOf(p3)[0], "Q1", scoreFor(q1, p3), "Classificados para a semifinal!", async (winnerPage) => {
    await expect(campaignPanel(winnerPage).getByRole("heading")).toHaveText("Classificados para a semifinal!");
    await winnerPage.reload();
    await expect(campaignPanel(winnerPage).getByRole("heading")).toHaveText("Classificados para a semifinal!");
    // A Semifinal 2 (2º × vencedor das Quartas 1) já nasceu: é a vez da dupla.
    await expect(campaignPanel(winnerPage)).toContainText("Semifinal 2 · contra " + name(p2));
    await expect(koCard(winnerPage, "Q1").locator(".ko-side-sets")).toHaveText(["2", "0"]);
  });
  // O parceiro corrige mantendo o vencedor.
  await launchKnockout(browser, testInfo, playersOf(p3)[1], "Q1", scoreFor(q1, p3, 1), "Classificados para a semifinal!");
  // Quem perdeu vê a despedida.
  page = await openAs(browser, testInfo, playersOf(p6)[0], "/mata-mata");
  await expect(campaignPanel(page).getByRole("heading")).toHaveText("Fim da campanha nesta edição");
  await closePage(page);
  await expectKnockoutIntegrity(3);

  // Correção de grupo depois do primeiro placar de mata-mata: recusada, com a mensagem na tela.
  const anyGroupMatch = groupMatches.find((match) => match.teamAId === p7 || match.teamBId === p7)!;
  const before = ledger.get(anyGroupMatch.id)!;
  page = await openAs(browser, testInfo, playersOf(p7)[1], "/jogos");
  await saveRefused(page, matchCard(page, anyGroupMatch), { setsA: before.setsB, setsB: before.setsA }, /mata-mata já tem placar lançado \(Quartas 1\).*não podem mais ser alterados/);
  await closePage(page);
  expect((await apiCall<Match[]>("GET", "/api/matches?stage=grupos")).body.find((match) => match.id === anyGroupMatch.id)!.result).toEqual(before);

  let q1Winner = p3;
  if (!mobile) {
    // Troca do vencedor das Quartas 1 antes de a semifinal ter placar: a semifinal troca de dupla.
    await launchKnockout(browser, testInfo, playersOf(p6)[1], "Q1", scoreFor(q1, p6), "Classificados para a semifinal!");
    q1Winner = p6;
    expect((await ko("S2")).teamBId).toBe(p6);
    page = await openAs(browser, testInfo, playersOf(p3)[0], "/mata-mata");
    await expect(campaignPanel(page).getByRole("heading")).toHaveText("Fim da campanha nesta edição");
    await expect(koCard(page, "S2").locator(".ko-side-team strong")).toHaveText([name(p2), name(p6)]);
    await closePage(page);
  }
  q1 = await ko("Q1");

  // --- Quartas 2 (4º × 5º): as duas duplas salvam o mesmo placar no mesmo instante.
  const q2 = await ko("Q2");
  {
    const [left, right] = await Promise.all([playersOf(p4)[1], playersOf(p5)[0]].map((playerId) => openAs(browser, testInfo, playerId, "/mata-mata")));
    const score = scoreFor(q2, p4);
    const forms = [await prepareScore(left, koCard(left, "Q2"), score), await prepareScore(right, koCard(right, "Q2"), score)];
    await Promise.all(forms.map((item) => item.submit()));
    await expect(toast(left, "success", "Classificados para a semifinal!")).toBeVisible();
    await expect(toast(right, "success", /Fim da campanha nesta edição/)).toBeVisible();
    recordSaved(q2.id, score, false);
    await closePage(left);
    await closePage(right);
  }
  await expectKnockoutIntegrity(4);
  // O parceiro do 4º corrige o placar mantendo o vencedor.
  await launchKnockout(browser, testInfo, playersOf(p4)[0], "Q2", scoreFor(q2, p4, 1), "Classificados para a semifinal!");

  // --- Semifinais: os dois jogos da fase salvos no mesmo instante, em dois navegadores.
  const s1 = await ko("S1");
  const s2 = await ko("S2");
  expect([[s1.teamAId, s1.teamBId], [s2.teamAId, s2.teamBId]]).toEqual([[p1, p4], [p2, q1Winner]]);
  {
    const [left, right] = await Promise.all([playersOf(p1)[0], playersOf(p2)[1]].map((playerId) => openAs(browser, testInfo, playerId, "/mata-mata")));
    const forms = [await prepareScore(left, koCard(left, "S1"), scoreFor(s1, p1)), await prepareScore(right, koCard(right, "S2"), scoreFor(s2, p2, 1))];
    await Promise.all(forms.map((item) => item.submit()));
    await expect(toast(left, "success", "Vocês estão na final!")).toBeVisible();
    await expect(toast(right, "success", "Vocês estão na final!")).toBeVisible();
    recordSaved(s1.id, scoreFor(s1, p1), false);
    recordSaved(s2.id, scoreFor(s2, p2, 1), false);
    await left.reload();
    await expect(campaignPanel(left).getByRole("heading")).toHaveText("Vocês estão na final!");
    await expect(campaignPanel(left)).toContainText("Sua vez");
    await closePage(left);
    await closePage(right);
  }
  // Final (vencedores) e disputa de 3º lugar (perdedores) nascem juntas.
  await expectKnockoutIntegrity(6);
  let final = await ko("F");
  let third = await ko("T");
  expect([[final.teamAId, final.teamBId], [third.teamAId, third.teamBId]]).toEqual([[p1, p2], [p4, q1Winner]]);
  page = await openAs(browser, testInfo, playersOf(p4)[0], "/mata-mata");
  await expect(campaignPanel(page).getByRole("heading")).toHaveText("Vocês vão disputar o 3º lugar");
  await expect(campaignPanel(page)).toContainText("Sua vez");
  await expect(campaignPanel(page)).toContainText("Disputa de 3º lugar · contra " + name(q1Winner));
  await expect(resultButtons(koCard(page, "F"))).toHaveCount(0);
  await closePage(page);

  // Troca do vencedor das Quartas 1 com a Semifinal 2 já disputada: recusada, mensagem na tela.
  const q1Loser = q1Winner === q1.teamAId ? q1.teamBId : q1.teamAId;
  page = await openAs(browser, testInfo, playersOf(q1Loser)[0], "/mata-mata");
  await saveRefused(page, koCard(page, "Q1"), scoreFor(q1, q1Loser), /Não é possível trocar o vencedor: Semifinal 2 já foi disputada/);
  await closePage(page);
  expect((await ko("Q1")).result).toEqual(q1.result);

  if (!mobile) {
    // Troca do vencedor da Semifinal 2 antes da final e do 3º lugar terem placar: as duas trocam de dupla.
    await launchKnockout(browser, testInfo, playersOf(q1Winner)[1], "S2", scoreFor(s2, q1Winner), "Vocês estão na final!");
    final = await ko("F");
    third = await ko("T");
    expect([[final.teamAId, final.teamBId], [third.teamAId, third.teamBId]]).toEqual([[p1, q1Winner], [p4, p2]]);
    await expectKnockoutIntegrity(6);
  }
  const finalist = final.teamBId;
  const thirdOpponent = third.teamBId;

  // --- Final: o campeão aparece na hora; a edição continua aberta até o 3º lugar.
  expect((await apiCall("GET", "/api/bracket/status")).body.editionFinished).toBe(false);
  page = await openAs(browser, testInfo, playersOf(p1)[1], "/mata-mata");
  await expect(page.locator(".ko-champion-name")).toHaveText("A definir");
  await saveScore(page, koCard(page, "F"), final.id, scoreFor(final, p1, 1), "Campeões da 5ª edição!");
  await expect(campaignPanel(page).getByRole("heading")).toHaveText("Campeões da 5ª edição!");
  await expect(page.locator(".ko-champion-name")).toHaveText(name(p1));
  await expect(page.locator(".ko-champion-note")).toHaveText("Campeão da 5ª edição");
  // Sem o 3º lugar a edição está aberta: os finalistas ainda podem corrigir a final.
  await expect(resultButtons(koCard(page, "F"))).toHaveText("Editar resultado");
  await page.reload();
  await expect(page.locator(".ko-champion-name")).toHaveText(name(p1));
  await expect(campaignPanel(page).getByRole("heading")).toHaveText("Campeões da 5ª edição!");
  await closePage(page);
  let status = (await apiCall("GET", "/api/bracket/status")).body;
  expect([status.editionFinished, status.champion?.teamId, status.phase]).toEqual([false, p1, "Mata-mata"]);
  page = await openAs(browser, testInfo, playersOf(finalist)[0], "/mata-mata");
  await expect(campaignPanel(page).getByRole("heading")).toHaveText("Vice-campeões da 5ª edição!");
  await closePage(page);

  // --- Disputa de 3º lugar: a conexão cai no primeiro clique; o jogador tenta de novo; nada duplica.
  page = await openAs(browser, testInfo, playersOf(p4)[1], "/mata-mata");
  await page.route("**/api/matches/*/result", (route) => route.abort("connectionfailed"), { times: 1 });
  const form = await prepareScore(page, koCard(page, "T"), scoreFor(third, p4));
  await form.submit();
  await expect(toast(page, "error", /não foi possível confirmar a gravação/)).toBeVisible();
  expect((await ko("T")).result).toBeNull();
  const retry = await prepareScore(page, koCard(page, "T"), scoreFor(third, p4));
  await retry.submit();
  await expect(toast(page, "success", "3º lugar da 5ª edição!")).toBeVisible();
  recordSaved(third.id, scoreFor(third, p4), false);
  await expect(campaignPanel(page).getByRole("heading")).toHaveText("3º lugar da 5ª edição!");
  // Edição encerrada: pódio completo e nenhum botão.
  const podium = page.getByRole("region", { name: "Pódio e premiação" });
  await expect(podium.locator(".knockout-podium-team")).toHaveText([name(p1), name(finalist), name(p4)]);
  await expect(podium.locator(".knockout-podium-title")).toHaveText(["Campeões · R$ 400 por dupla", "Vice-campeões · R$ 200 por dupla", "Terceiro lugar · R$ 100 por dupla"]);
  await expect(resultButtons(page)).toHaveCount(0);
  await page.reload();
  await expect(resultButtons(page)).toHaveCount(0);
  await closePage(page);
  page = await openAs(browser, testInfo, playersOf(thirdOpponent)[0], "/mata-mata");
  await expect(campaignPanel(page).getByRole("heading")).toHaveText("Fim da campanha nesta edição: 4º lugar");
  await expect(resultButtons(page)).toHaveCount(0);
  await closePage(page);
  status = (await apiCall("GET", "/api/bracket/status")).body;
  expect([status.editionFinished, status.champion?.teamId, status.phase]).toEqual([true, p1, "Campeonato Finalizado"]);
  await expectKnockoutIntegrity(6);
});

test("5. edição encerrada: jogador sem botões e API recusando; Hall da Fama e Maiores Campeões mostram o título da 5ª edição", async ({ browser }, testInfo) => {
  const status = (await apiCall("GET", "/api/bracket/status")).body;
  expect([status.editionFinished, status.phase, status.syncPending, status.anomalies]).toEqual([true, "Campeonato Finalizado", false, []]);
  const champion = team(status.champion.teamId);
  const championPlayer = champion.player1Id;

  // 27 partidas, todas com placar, todas lançadas pela interface.
  const all = (await apiCall<Match[]>("GET", "/api/matches")).body;
  expect(all.length).toBe(27);
  expect(all.every((match) => match.status === "realizado" && match.result !== null)).toBe(true);
  expect(all.map((match) => match.id).sort()).toEqual([...launchedMatchIds].sort());
  expect(counters.uiFirstLaunches).toBe(27);
  for (const match of all) expect(match.result, match.round + " " + match.order).toEqual(ledger.get(match.id));

  // Entra pela tela como campeão: nenhum botão em Jogos (todos os filtros) nem em Mata-mata.
  const page = await newPage(browser, testInfo, null);
  await screenLogin(page, championPlayer);
  await page.goto("/jogos");
  await expect(page.locator(".round-match").first()).toBeVisible();
  await expect(resultButtons(page)).toHaveCount(0);
  for (const tab of ["Mata-mata", "Todas as Rodadas"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(page.locator(".match-card, .round-match").filter({ visible: true }).first()).toBeVisible();
    await expect(resultButtons(page)).toHaveCount(0);
  }
  await page.getByRole("tab", { name: "Mata-mata", exact: true }).click();
  await expect(page.locator(".match-group-title")).toContainText(["Quartas de final", "Semifinal", "Disputa de 3º lugar", "Final"]);
  await page.goto("/mata-mata");
  await expect(page.locator(".ko-champion-name")).toHaveText(champion.name);
  await expect(resultButtons(page)).toHaveCount(0);
  const final = all.find((match) => match.round === "Final")!;
  const refused = await apiCall("POST", `/api/matches/${final.id}/result`, championPlayer, { setsA: 2, setsB: 0 });
  expect([refused.status, refused.body.code]).toEqual([403, "edition_finished"]);
  const groupRefused = await apiCall("POST", `/api/matches/${groupMatches.find((match) => match.teamAId === champion.id || match.teamBId === champion.id)!.id}/result`, championPlayer, { setsA: 2, setsB: 0 });
  expect(groupRefused.status).toBe(403);

  // Hall da Fama: lido pelo navegador em /rest/v1/truco_history (no ensaio, servido pelo backend de ensaio).
  rehearsalPaths.clear();
  await page.goto("/hall-da-fama");
  const duo = page.getByRole("list", { name: "Dupla campeã da 5ª edição" });
  await expect(duo).toHaveCount(1);
  for (const playerId of [champion.player1Id, champion.player2Id]) await expect(duo).toContainText(new RegExp(escapeRegExp(playerNames.get(playerId)!) + "(?!\\d)"));
  expect([...rehearsalPaths]).toContain("/rest/v1");
  const restRows = (await (await api.get("/rest/v1/truco_history")).json()) as Array<{ edition: number; champion: { name: string } }>;
  expect(restRows.map((row) => row.edition)).toEqual([1, 2, 3, 4, 5]);
  expect(restRows[4].champion.name).toBe(champion.name);

  // Maiores Campeões: a dupla campeã tem a 5ª edição entre as conquistas, uma vez só.
  await page.goto("/maiores-campeoes");
  const plaque = page.locator(".edition-plaque").filter({ hasText: "5ª" });
  await expect(plaque).toHaveCount(1);
  const major = (await apiCall<Array<{ name: string; titles: number; editions: number[] }>>("GET", "/api/history/major-champions")).body;
  const entry = major.find((item) => item.editions.includes(5))!;
  expect(major.filter((item) => item.editions.includes(5)).length).toBe(1);
  for (const playerId of [champion.player1Id, champion.player2Id]) expect(entry.name).toMatch(new RegExp(escapeRegExp(playerNames.get(playerId)!) + "(?!\\d)"));
  await expect(page.getByText(entry.name, { exact: true }).first()).toBeVisible();

  // Sair e entrar com outro usuário (eliminado na fase de grupos): também sem botões.
  await screenLogout(page);
  const eliminated = playersOf(await seeded(7))[1];
  await screenLogin(page, eliminated);
  await page.goto("/jogos");
  await expect(page.locator(".round-match").first()).toBeVisible();
  await expect(resultButtons(page)).toHaveCount(0);
  await page.goto("/mata-mata");
  await expect(page.locator(".ko-champion-name")).toHaveText(champion.name);
  await expect(resultButtons(page)).toHaveCount(0);
});
