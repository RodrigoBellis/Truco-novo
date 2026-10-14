import { expect, test, type Page } from "@playwright/test";
import { snapshotGroups, snapshotMatches, snapshotPlayers, snapshotStandings, snapshotTeams } from "./fixtures/edition5Snapshot";

// Dados fictícios só para os testes, no formato definitivo da edição: 7 duplas num grupo único.
const players = Array.from({ length: 14 }, (_, index) => ({
  id: `player-${index + 1}`,
  name: `Jogador ${index + 1}`,
  role: "jogador",
  teamId: null,
  avatarUrl: index < 2 ? `/avatars/player-${index + 1}.webp` : null,
}));

const teams = Array.from({ length: 7 }, (_, index) => ({
  id: `team-${index + 1}`,
  name: `Dupla ${index + 1}`,
  player1Id: players[index * 2].id,
  player2Id: players[index * 2 + 1].id,
  status: "aprovada",
  seeded: false,
  isPlaceholder: false,
  groupId: "A",
  strength: index % 5 + 1,
}));

const groups = [
  { id: "A", name: "Grupo Único", teamIds: teams.map((team) => team.id) },
];

const standings = (teamList: typeof teams) => teamList.map((team, index) => ({
  position: index + 1,
  teamId: team.id,
  jogos: 0,
  vitorias: 0,
  vitorias2x0: 0,
  derrotas: 0,
  pontos: 0,
  saldoSets: 0,
  confrontoDireto: 0,
  tiePending: false,
}));

const groupPairs = Array.from({ length: 7 }, (_, first) => Array.from({ length: 7 - first - 1 }, (_, offset) => [first, first + offset + 1] as const)).flat();
const matches = groupPairs.map(([first, second], index) => ({
  id: `match-${index + 1}`,
  championshipId: "edition-5",
  stage: "grupos",
  round: "Grupo A",
  order: index,
  groupId: "A",
  teamAId: teams[first].id,
  teamBId: teams[second].id,
  result: null,
  status: "pendente",
  tableNumber: null,
  blockNumber: null,
  queuePosition: null,
}));

function testToken(expired = false, version = "initial") {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "auth-user", role: "authenticated", exp: Math.floor(Date.now() / 1000) + (expired ? -3600 : 3600), version })}.${encode("test-signature")}`;
}

const authUser = { id: "auth-user", aud: "authenticated", role: "authenticated", email: "test@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };

/** Supabase Auth simulado: valida tokens de teste e renova a sessão. */
async function routeSupabaseAuth(page: Page) {
  await page.route("**/auth/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const payload = path.endsWith("/token")
      ? { access_token: testToken(false, "renewed"), refresh_token: "renewed-test-refresh", token_type: "bearer", expires_in: 3600, user: authUser }
      : authUser;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

async function installSession(page: Page, role: "admin" | "jogador", teamId: string | null = null, expired = false) {
  await routeSupabaseAuth(page);
  await page.addInitScript(({ role: sessionRole, teamId: sessionTeamId, accessToken }) => {
    if (localStorage.getItem("truco-do-novo:session")) return;
    localStorage.setItem("truco-do-novo:session", JSON.stringify({
      user: {
        id: "auth-user",
        playerId: "player-1",
        name: sessionRole === "admin" ? "Admin" : "Jogador 1",
        email: "test@example.invalid",
        role: sessionRole,
        teamId: sessionTeamId,
        mustChangePassword: false,
        avatarUrl: null,
      },
      token: accessToken,
      refreshToken: "test-refresh",
    }));
  }, { role, teamId, accessToken: testToken(expired) });
}

async function mockCoreApi(page: Page, role: "admin" | "jogador", resultSaved = false, smallTeamList = false, noMatches = false) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let payload: unknown = {};
    if (url.pathname.endsWith("/players/me/avatar")) payload = { avatarUrl: "/avatars/player-1-updated.jpg" };
    else if (url.pathname.endsWith("/players") && route.request().method() === "POST") payload = { id: "new-player", name: "Nova Pessoa", role: "jogador", teamId: null, avatarUrl: null };
    else if (url.pathname.endsWith("/teams") && route.request().method() === "POST") payload = { ...teams[0], name: route.request().postDataJSON().name };
    else if (url.pathname.endsWith("/teams")) payload = smallTeamList ? teams.slice(0, 5) : teams;
    else if (url.pathname.endsWith("/players")) payload = players;
    else if (url.pathname.endsWith("/groups")) payload = groups;
    else if (url.pathname.includes("/standings")) payload = standings(teams);
    else if (url.pathname.endsWith("/matches/audit")) payload = [];
    else if (url.pathname.endsWith("/matches/lock")) payload = { locked: false };
    else if (url.pathname.endsWith("/matches")) payload = noMatches ? [] : matches.map((match, index) => index === 0 && resultSaved ? { ...match, result: { setsA: 2, setsB: 0 }, status: "realizado" } : match);
    else if (url.pathname.endsWith("/bracket")) payload = [];
    else if (url.pathname.endsWith("/dashboard")) payload = { currentPhase: "Fase de Grupos", drawStatus: "realizado", pendingApprovals: 0, upcomingMatches: [], stats: {} };
    else if (url.pathname.endsWith("/schedule/my-status")) payload = { status: "aguardando", opponentTeamId: null, matchesAhead: null };
    else if (url.pathname.endsWith("/history/major-champions")) payload = [
      { key: "historical-1", players: ["Campeão 1", "Campeão 2"], name: "Campeão 1 & Campeão 2", titles: 2, editions: [3, 4], rank: 1 },
      { key: "historical-2", players: ["Campeão 3", "Campeão 4"], name: "Campeão 3 & Campeão 4", titles: 1, editions: [2], rank: 2 },
      { key: "historical-3", players: ["Campeão 5", "Campeão 6"], name: "Campeão 5 & Campeão 6", titles: 1, editions: [1], rank: 2 },
    ];
    else if (url.pathname.endsWith("/history")) payload = { editions: [{ id: "history-1", edition: 4, name: "4ª Edição", year: 2025, champions: ["Campeão 1", "Campeão 2"], runnersUp: null, finalResult: null, notes: "" }], currentEdition: 5, currentYear: 2026 };
    else if (url.pathname.endsWith("/players/roster")) payload = players.map(({ id, name }) => ({ id, name }));
    else if (url.pathname.endsWith("/admin/sorteio")) payload = { message: "Sorteio desativado" };
    else if (url.pathname.endsWith("/groups/generate-matches")) payload = { matchesCreated: 21 };
    else if (url.pathname.match(/\/matches\/[^/]+\/result$/)) payload = { ...matches[0], result: route.request().postDataJSON(), status: "realizado" };
    else if (url.pathname.endsWith("/matches") || url.pathname.endsWith("/teams") || url.pathname.endsWith("/players")) payload = [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await installSession(page, role, role === "jogador" ? teams[0].id : null);
}

test("admin cadastra pessoa e define dupla, grupo e estrelas", async ({ page }) => {
  await mockCoreApi(page, "admin", false, true);
  await page.goto("/admin/jogadores");
  await page.getByLabel("Cadastrar pessoa").fill("Nova Pessoa");
  await page.getByRole("button", { name: "Adicionar jogador" }).click();
  await expect(page.getByText("Jogador cadastrado.")).toBeVisible();

  await page.goto("/admin/duplas");
  await page.getByLabel("Nome da dupla").fill("Dupla de teste");
  await page.getByRole("combobox", { name: "Jogador 1", exact: true }).selectOption("player-13");
  await page.getByRole("combobox", { name: "Jogador 2", exact: true }).selectOption("player-14");
  await expect(page.getByLabel("Grupo")).toHaveValue("A");
  await expect(page.getByLabel("Grupo").locator("option")).toHaveText(["Grupo Único"]);
  await page.getByLabel("Força da dupla").selectOption("5");
  await expect(page.getByText("Dupla de teste").first()).toBeVisible();
  await page.getByRole("button", { name: "Salvar dupla" }).click();
  await expect(page.getByText("Participação atualizada.").or(page.getByText("Dupla criada para esta edição."))).toBeVisible();
});

test("admin confere as sete posições do grupo único e solicita os 21 jogos", async ({ page }) => {
  await mockCoreApi(page, "admin", false, false, true);
  await page.goto("/admin/grupos");
  await expect(page.getByRole("heading", { name: "Grupo Único" })).toBeVisible();
  await expect(page.getByText("Semifinal", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Quartas", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Eliminado", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Repescagem", { exact: true })).toHaveCount(0);
  await expect(page.getByText("7º", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("8º", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Grupo B", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Gerar 21 jogos da fase de grupos" }).click();
  await expect(page.getByText("21 jogos criados com os grupos definidos pelo administrador.")).toBeVisible();
});

test("admin gera só os jogos que faltam quando uma dupla entra depois", async ({ page }) => {
  await mockCoreApi(page, "admin");
  // Jogos já gerados com 6 duplas: faltam os 6 da dupla 7.
  const newcomers = ["team-7"];
  await page.route("**/api/matches**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(matches.filter((match) => !newcomers.includes(match.teamAId) && !newcomers.includes(match.teamBId))) }));
  let completeCalls = 0;
  await page.route("**/api/groups/complete-matches", (route) => {
    completeCalls += 1;
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ matchesCreated: 6 }) });
  });
  await page.goto("/admin/grupos");
  await expect(page.getByRole("button", { name: /Gerar 21 jogos/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Gerar 6 jogos das duplas novas" }).click();
  await expect(page.getByText("6 jogos criados para as duplas novas. Placar e ordem dos jogos já disputados não mudaram.")).toBeVisible();
  expect(completeCalls).toBe(1);
});

test("jogador visualiza dupla e parceiro, lança e corrige resultado", async ({ page }) => {
  await mockCoreApi(page, "jogador", true);
  await page.goto("/minha-dupla");
  const profile = page.getByRole("region", { name: "Perfil da sua dupla" });
  await expect(profile.locator(".team-profile-member strong")).toHaveText(["Jogador 1", "Jogador 2"]);
  await expect(profile.locator(".team-profile-role")).toHaveText(["Você", "Seu parceiro"]);
  await page.goto("/jogos");
  await expect(page.getByRole("heading", { name: "Jogos" })).toBeVisible();
  await page.getByRole("button", { name: "Editar resultado" }).first().click();
  await page.getByRole("button", { name: "1x2" }).click();
  await page.getByRole("button", { name: "Salvar correção" }).click();
  await expect(page.getByRole("heading", { name: "Substituir o resultado já lançado?" })).toBeVisible();
  await page.getByRole("button", { name: "Salvar correção" }).last().click();
  await expect(page.getByText(/Resultado atualizado com sucesso/)).toBeVisible();

  await page.getByRole("button", { name: "Lançar resultado" }).first().click();
  await page.getByRole("button", { name: "1x2" }).click();
  await page.getByRole("button", { name: "Confirmar resultado" }).click();
  await expect(page.getByText(/Resultado registrado!/)).toBeVisible();
});

test("Grupos mostra o grupo único com as 7 duplas e destaca a dupla do jogador", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.goto("/grupos");
  await expect(page.getByRole("heading", { name: "Grupo Único" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.locator(".standings-row")).toHaveCount(7);
  await expect(page.getByText("Dupla 7").first()).toBeVisible();
  await expect(page.getByText("Sua dupla está aqui")).toBeVisible();
  await expect(page.locator(".standings-row-mine")).toHaveCount(1);
  await expect(page.getByText("Grupo B", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/1º e 2º na semifinal · 3º a 6º nas quartas · 7º eliminado/)).toBeVisible();
});

test("Jogos: Meus Jogos, 7 rodadas visuais com 3 mesas e quem descansa, progresso e classificação ao vivo", async ({ page }) => {
  await mockCoreApi(page, "jogador", true);
  await page.goto("/jogos");
  await expect(page.getByRole("tab", { name: "Meus Jogos" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".matches-progress")).toContainText("1 de 21");
  // Meus Jogos: os 6 da Dupla 1, pendentes primeiro, o finalizado por último.
  const mine = page.locator(".round-match");
  await expect(mine).toHaveCount(6);
  await expect(page.locator(".round-match.is-done")).toHaveCount(1);
  await expect(mine.last()).toContainText("Finalizado");
  await expect(mine.last().locator(".round-team-sets")).toHaveText(["2", "0"]);
  await expect(page.locator(".round-match-mine")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Lançar resultado" })).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Editar resultado" })).toHaveCount(1);
  // Antes do mata-mata existir não há aba de mata-mata.
  await expect(page.getByRole("tab", { name: "Mata-mata" })).toHaveCount(0);

  // Todas as Rodadas: 7 rodadas, 3 mesas cada, uma dupla descansando, os 21 jogos uma vez.
  await page.getByRole("tab", { name: "Todas as Rodadas" }).click();
  await expect(page.locator(".round")).toHaveCount(7);
  await expect(page.locator(".round .round-match")).toHaveCount(21);
  for (let index = 0; index < 7; index += 1) {
    const round = page.locator(".round").nth(index);
    await expect(round.locator(".round-title")).toHaveText(`Rodada ${index + 1}`);
    await expect(round.locator(".round-table")).toHaveText(["Mesa 1", "Mesa 2", "Mesa 3"]);
    await expect(round.locator(".round-rest")).toHaveCount(1);
  }
  const resting = await page.locator(".round-rest strong").allTextContents();
  expect([...resting].sort()).toEqual(teams.map((team) => team.name).sort());
  // Jogos de outras duplas não oferecem ação; os da Dupla 1 sim.
  const others = page.locator(".round .round-match:not(.round-match-mine)");
  await expect(others).toHaveCount(15);
  await expect(others.getByRole("button")).toHaveCount(0);

  // Classificação ao vivo, da API, com a dupla destacada.
  const standingsSection = page.getByRole("region", { name: "Classificação ao vivo" });
  await expect(standingsSection.locator(".standings-row")).toHaveCount(7);
  await expect(standingsSection.locator(".standings-row-mine")).toHaveCount(1);
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
  if (process.env.MOTION_SHOTS) {
    for (const theme of ["dark", "light"] as const) {
      await page.evaluate((value) => {
        localStorage.setItem("truco-do-novo:theme", value);
        localStorage.setItem("truco-do-novo:appearance-version", "black-background-v1");
      }, theme);
      await page.reload();
      await page.getByRole("tab", { name: "Meus Jogos" }).click();
      await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
      await page.screenshot({ path: `${process.env.MOTION_SHOTS}/${test.info().project.name}_jogos-meus_${theme}.png`, fullPage: true });
      await page.getByRole("tab", { name: "Todas as Rodadas" }).click();
      await expect(page.locator(".round").first()).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
      await page.screenshot({ path: `${process.env.MOTION_SHOTS}/${test.info().project.name}_jogos-rodadas_${theme}.png`, fullPage: false });
    }
  }
});

test("rotas antigas levam às telas consolidadas sem quebrar", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  for (const oldPath of ["/meu-grupo", "/classificacao"]) {
    await page.goto(oldPath);
    await expect(page).toHaveURL(/\/grupos$/);
  }
  for (const oldPath of ["/mesas-agora", "/ordem-dos-jogos", "/resultados"]) {
    await page.goto(oldPath);
    await expect(page).toHaveURL(/\/jogos$/);
  }
});

test("jogador envia foto pelo perfil e as fotos ficam visíveis na dupla", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.goto("/perfil");
  await page.locator("#avatar-camera-input").setInputFiles({
    name: "rosto.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pL8AAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.getByRole("status")).toHaveText("Foto atualizada. Ela já aparece nas listas e nos jogos.");
  await page.goto("/minha-dupla");
  await expect(page.locator(".team-profile-member .player-avatar img").first()).toHaveAttribute("src", "/avatars/player-1.webp");
  await expect(page.locator(".team-profile-member .player-avatar img").nth(1)).toHaveAttribute("src", "/avatars/player-2.webp");
});

test("a tela de entrada usa a arte da edição correspondente ao tema escolhido", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("truco-do-novo:appearance-version")) {
      localStorage.setItem("truco-do-novo:theme", "light");
    }
  });
  await page.goto("/login");
  const hero = page.getByRole("img", { name: "Truco do Novo — 5ª Edição" });
  await expect(hero).toHaveAttribute("src", /truco-5-edicao\.webp/);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(8, 10, 16)");
  await expect(page.locator("body")).toHaveCSS("background-image", "none");
  await page.getByRole("switch", { name: "Trocar para tema claro" }).click();
  await expect(hero).toHaveAttribute("src", /truco-5-edicao\.png/);
  await page.reload();
  await expect(hero).toHaveAttribute("src", /truco-5-edicao\.png/);
  await page.getByRole("switch", { name: "Trocar para tema escuro" }).click();
  await expect(hero).toHaveAttribute("src", /truco-5-edicao\.webp/);
});

const rosterPlayers = players.slice(0, 6).map(({ id, name }) => ({ id, name }));

/** Entrada sem sessão: lista pública de jogadores e /auth/login registrando cada tentativa. */
async function mockLoginEntry(page: Page) {
  const loginBodies: unknown[] = [];
  await routeSupabaseAuth(page);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let payload: unknown = {};
    if (url.pathname.endsWith("/players/roster")) payload = rosterPlayers;
    else if (url.pathname.endsWith("/auth/login")) {
      const body = route.request().postDataJSON() as { playerId?: string; email?: string };
      loginBodies.push(body);
      const player = rosterPlayers.find((candidate) => candidate.id === body.playerId);
      payload = {
        user: { id: "auth-user", playerId: player?.id ?? "", name: player?.name ?? "Administrador", email: "test@example.invalid", role: player ? "jogador" : "admin", teamId: player ? "team-2" : null, mustChangePassword: false, avatarUrl: null },
        token: testToken(),
        refreshToken: "test-refresh",
      };
    } else if (url.pathname.endsWith("/teams") || url.pathname.endsWith("/players") || url.pathname.endsWith("/matches")) payload = [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  return loginBodies;
}

const activeCardName = (page: Page) => page.locator(".deck-info-name");

test("entrada mostra as cartas dos jogadores reais e só autentica depois da senha", async ({ page }) => {
  const loginBodies = await mockLoginEntry(page);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Quem está entrando para jogar?" })).toBeVisible();
  const deck = page.getByRole("region", { name: "Cartas dos jogadores" });
  await expect(deck.locator(".deck-card-button")).toHaveCount(rosterPlayers.length);
  await expect(activeCardName(page)).toHaveText("Jogador 3");

  await page.getByRole("button", { name: "Próxima carta" }).click();
  await expect(activeCardName(page)).toHaveText("Jogador 4");
  await deck.locator(".deck-slot-active .deck-card-button").click();
  const confirm = page.getByRole("button", { name: "Entrar como Jogador 4" });
  await expect(confirm).toBeVisible();
  expect(loginBodies).toHaveLength(0);

  await confirm.click();
  await expect(page.getByRole("heading", { name: "Jogador 4" })).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeFocused();
  expect(loginBodies).toHaveLength(0);

  await page.getByLabel("Senha").fill("segredo");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/abertura$/);
  expect(loginBodies).toEqual([{ playerId: "player-4", password: "segredo" }]);
});

test("cartas navegam por arrasto e teclado e trocar de usuário volta à mesma carta", async ({ page }) => {
  await mockLoginEntry(page);
  await page.goto("/login");
  const viewport = page.locator(".deck-viewport");
  await expect(activeCardName(page)).toHaveText("Jogador 3");
  const box = (await viewport.boundingBox())!;
  const y = box.y + box.height * 0.9;
  await page.mouse.move(box.x + box.width / 2 + 120, y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) await page.mouse.move(box.x + box.width / 2 + 120 - step * 24, y);
  await page.mouse.up();
  await expect(activeCardName(page)).not.toHaveText("Jogador 3");
  // Soltar o arrasto não escolhe carta: continua navegando.
  await expect(page.getByRole("button", { name: /^Entrar como / })).toHaveCount(0);

  await page.locator(".deck-slot-active .deck-card-button").focus();
  await page.keyboard.press("Home");
  await expect(activeCardName(page)).toHaveText("Jogador 1");
  await page.keyboard.press("ArrowRight");
  await expect(activeCardName(page)).toHaveText("Jogador 2");
  await expect(page.locator(".deck-slot-active .deck-card-button")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Entrar como Jogador 2" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Jogador 2" })).toBeVisible();

  await page.getByRole("button", { name: "Não é você? Entrar com outro usuário" }).click();
  await expect(page.getByRole("heading", { name: "Quem está entrando para jogar?" })).toBeVisible();
  await expect(activeCardName(page)).toHaveText("Jogador 2");
});

test("entrada mantém a área administrativa e a lista simples de nomes", async ({ page }) => {
  const loginBodies = await mockLoginEntry(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Ver lista de nomes" }).click();
  await expect(page.getByRole("heading", { name: "Selecione seu perfil" })).toBeVisible();
  await page.getByRole("button", { name: "Jogador 5" }).click();
  await expect(page.getByRole("heading", { name: "Jogador 5" })).toBeVisible();
  await page.getByRole("button", { name: "← Voltar" }).click();

  await page.getByRole("button", { name: "Área administrativa" }).click();
  await expect(page.getByRole("heading", { name: "Administrador" })).toBeVisible();
  await page.getByLabel("Senha").fill("admin");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect.poll(() => loginBodies).toEqual([{ email: "admin@trucodonovo.com", password: "admin" }]);
});

test("com movimento reduzido as cartas ficam numa fila plana e a escolha continua igual", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockLoginEntry(page);
  await page.goto("/login");
  await expect(page.locator(".deck")).toHaveAttribute("data-mode", "reduced");
  await page.getByRole("button", { name: "Carta anterior" }).click();
  await expect(activeCardName(page)).toHaveText("Jogador 2");
  await page.getByRole("button", { name: "Esta é a minha carta" }).click();
  await expect(page.getByRole("button", { name: "Entrar como Jogador 2" })).toBeVisible();
  const transform = await page.locator(".deck-slot-active").evaluate((element) => (element as HTMLElement).style.transform);
  expect(transform).not.toContain("rotateY");

  // Salto longo pelo teclado: a carta que tinha o foco some da fila, e o foco precisa seguir a nova.
  await page.getByRole("button", { name: "Escolher outra carta" }).click();
  await page.locator(".deck-slot-active .deck-card-button").focus();
  await page.keyboard.press("End");
  await expect(activeCardName(page)).toHaveText("Jogador 6");
  await expect(page.locator(".deck-slot-active .deck-card-button")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(activeCardName(page)).toHaveText("Jogador 5");
  await expect(page.locator(".deck-slot-active .deck-card-button")).toBeFocused();
});

// ---------- Troca de usuário: cada conta vê só a própria dupla ----------
// Classificação como o backend (truco_rpc_standings) a devolveria, com valores diferentes
// para cada dupla: se uma tela reaproveitar estado de outro usuário ou pegar a linha errada
// (primeira do grupo, outra dupla), o número exibido não bate.
type StandingFixture = { position: number; teamId: string; jogos: number; vitorias: number; vitorias2x0: number; derrotas: number; pontos: number; saldoSets: number; confrontoDireto: number; tiePending: boolean };
interface League {
  players: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string; player1Id: string; player2Id: string; groupId: string | null }>;
  groups: unknown[];
  standings: Record<"A", StandingFixture[]>;
  matches: Array<{ teamAId: string; teamBId: string; status: string }>;
}

const fixtureRow = (position: number, teamId: string, jogos: number, vitorias: number, derrotas: number, pontos: number, saldoSets: number): StandingFixture =>
  ({ position, teamId, jogos, vitorias, vitorias2x0: 0, derrotas, pontos, saldoSets, confrontoDireto: 0, tiePending: false });
const leagueStandings: Record<"A", StandingFixture[]> = {
  A: [
    fixtureRow(1, "team-3", 4, 4, 0, 10, 5), fixtureRow(2, "team-1", 4, 3, 1, 8, 2), fixtureRow(3, "team-7", 3, 3, 0, 9, 4), fixtureRow(4, "team-2", 4, 2, 2, 6, 1),
    fixtureRow(5, "team-6", 3, 1, 2, 3, -1), fixtureRow(6, "team-5", 4, 1, 3, 3, -2), fixtureRow(7, "team-4", 4, 0, 4, 1, -6),
  ],
};
const fictionalLeague: League = { players, teams, groups, standings: leagueStandings, matches };
const realSnapshotLeague: League = { players: snapshotPlayers, teams: snapshotTeams, groups: snapshotGroups, standings: snapshotStandings, matches: snapshotMatches };

function tokenFor(sub: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.${encode("test-signature")}`;
}

/** Backend e Supabase Auth simulados para várias contas: o usuário da sessão vem do JWT de cada requisição. */
async function mockLeagueWithAccounts(page: Page, league: League) {
  const subOf = (authorization: string | undefined) => {
    try { return JSON.parse(Buffer.from((authorization ?? "").replace("Bearer ", "").split(".")[1], "base64url").toString()).sub as string; } catch { return null; }
  };
  const authUserFor = (sub: string) => ({ ...authUser, id: sub, email: `${sub}@example.invalid` });
  await page.route("**/auth/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/logout")) return route.fulfill({ status: 204, body: "" });
    if (path.endsWith("/token")) {
      const sub = String(route.request().postDataJSON()?.refresh_token ?? "").replace("refresh:", "");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: tokenFor(sub), refresh_token: `refresh:${sub}`, token_type: "bearer", expires_in: 3600, user: authUserFor(sub) }) });
    }
    const sub = subOf(route.request().headers().authorization);
    return route.fulfill({ status: sub ? 200 : 401, contentType: "application/json", body: JSON.stringify(sub ? authUserFor(sub) : { message: "sem sessão" }) });
  });
  await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let payload: unknown = {};
    if (url.pathname.endsWith("/auth/login")) {
      const { playerId } = route.request().postDataJSON() as { playerId: string };
      const player = league.players.find((candidate) => candidate.id === playerId)!;
      const team = league.teams.find((candidate) => candidate.player1Id === playerId || candidate.player2Id === playerId)!;
      const user = { id: `auth-${playerId}`, playerId, name: player.name, email: "test@example.invalid", role: "jogador", teamId: team.id, mustChangePassword: false, avatarUrl: null };
      payload = { user, token: tokenFor(user.id), refreshToken: `refresh:${user.id}` };
    } else if (url.pathname.endsWith("/players/roster")) payload = league.players.map(({ id, name }) => ({ id, name }));
    else if (url.pathname.endsWith("/players")) payload = league.players;
    else if (url.pathname.endsWith("/teams")) payload = league.teams;
    else if (url.pathname.endsWith("/groups")) payload = league.groups;
    else if (url.pathname.endsWith("/A/standings")) payload = league.standings.A;
    else if (url.pathname.endsWith("/matches/lock")) payload = { locked: false };
    else if (url.pathname.endsWith("/matches")) payload = league.matches;
    else if (url.pathname.endsWith("/schedule/my-status")) payload = { status: "aguardando", opponentTeamId: null, matchesAhead: null };
    else if (url.pathname.endsWith("/history/major-champions") || url.pathname.endsWith("/bracket")) payload = [];
    else if (url.pathname.endsWith("/dashboard")) payload = { currentPhase: "Fase de Grupos", drawStatus: "realizado", pendingApprovals: 0, nextMatches: [], champion: null };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

/** Navega pelo menu real: no celular, alguns itens ficam dentro de "Mais". */
async function openMenu(page: Page, label: "Início" | "Minha Dupla" | "Grupos" | "Jogos" | "Sair") {
  const role = label === "Sair" ? "button" : "link";
  // Depois de recarregar, o menu ainda pode estar montando: espera "Início" aparecer
  // (fica visível no menu lateral e na barra do celular) antes de decidir se usa "Mais".
  await expect(page.getByRole("link", { name: "Início", exact: true }).filter({ visible: true }).first()).toBeVisible();
  const direct = page.getByRole(role, { name: label, exact: true }).filter({ visible: true });
  if (await direct.count() === 0) await page.getByRole("button", { name: "Mais" }).click();
  await page.getByRole(role, { name: label, exact: true }).filter({ visible: true }).first().click();
}

async function loginAs(page: Page, playerName: string) {
  await page.getByRole("button", { name: "Ver lista de nomes" }).click();
  await page.locator(".profile-card").filter({ has: page.locator(".profile-name", { hasText: new RegExp(`^${playerName}$`) }) }).click();
  await page.getByLabel("Senha").fill("senha-de-teste");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  // A abertura aparece uma vez por sessão do navegador e por conta.
  await expect(page).toHaveURL(/\/(abertura|inicio)$/);
  if (page.url().endsWith("/abertura")) await page.getByRole("button", { name: /Entrar na edição atual/ }).click();
}

async function logout(page: Page) {
  await openMenu(page, "Sair");
  await expect(page.getByRole("heading", { name: "Quem está entrando para jogar?" })).toBeVisible();
}

/** Início, Minha Dupla, Grupos e Jogos precisam mostrar a mesma linha: a da dupla do usuário logado. */
async function expectOwnTeamEverywhere(page: Page, league: League, teamName: string) {
  const team = league.teams.find((candidate) => candidate.name === teamName)!;
  const groupId = team.groupId as "A";
  const row = league.standings[groupId].find((candidate) => candidate.teamId === team.id)!;
  const saldo = `${row.saldoSets > 0 ? "+" : ""}${row.saldoSets}`;
  const pending = league.matches.filter((match) => match.status === "pendente" && [match.teamAId, match.teamBId].includes(team.id)).length;

  // O Início mostra a dupla, os dois integrantes e o grupo; posição e números ficam em Minha Dupla e Grupos.
  await openMenu(page, "Início");
  const hero = page.getByRole("region", { name: "Resumo da sua dupla" });
  await expect(hero.locator(".home-hero-name")).toHaveText(teamName);
  await expect(hero.locator(".home-hero-member strong")).toHaveText([team.player1Id, team.player2Id].map((id) => league.players.find((player) => player.id === id)!.name));
  await expect(hero.locator(".home-hero-role-me")).toHaveText("Você");
  await expect(hero.getByText("Seu parceiro", { exact: true })).toHaveCount(1);
  await expect(hero.locator(".home-hero-group")).toHaveText("Grupo Único");

  await openMenu(page, "Minha Dupla");
  await expect(page.locator(".team-profile-name")).toHaveText(teamName);
  await expect(page.locator(".team-profile-member strong")).toHaveText([team.player1Id, team.player2Id].map((id) => league.players.find((player) => player.id === id)!.name));
  await expect(page.locator(".team-profile-group-mark")).toHaveText("Grupo Único");
  await expect(page.locator(".team-profile-position")).toHaveText(`${row.position}º lugar`);
  // Os números contam até o valor (AnimatedCounter); toHaveText espera a contagem terminar.
  await expect(page.locator(".team-performance dd")).toHaveText([String(row.pontos), String(row.vitorias), String(row.derrotas), saldo]);

  await openMenu(page, "Grupos");
  await expect(page.locator(".standings-row-mine")).toHaveCount(1);
  await expect(page.locator(".standings-row-mine .standings-team-name")).toHaveText(teamName);
  await expect(page.locator(".standings-row-mine .standings-position")).toHaveText(`${row.position}º`);
  await expect(page.locator(".standings-row-mine .standings-points")).toHaveText(String(row.pontos));

  await openMenu(page, "Jogos");
  // Meus Jogos: só os confrontos desta dupla; a classificação ao vivo destaca a linha dela.
  await expect(page.locator(".round-match-mine")).toHaveCount(league.matches.filter((match) => [match.teamAId, match.teamBId].includes(team.id)).length);
  await expect(page.locator(".round-match").filter({ hasText: teamName })).toHaveCount(await page.locator(".round-match").count());
  await expect(page.locator(".round-match:not(.is-done)")).toHaveCount(pending);
  await expect(page.locator(".matches-standings .standings-row-mine .standings-team-name")).toHaveText(teamName);
  await expect(page.locator(".matches-standings .standings-row-mine .standings-position")).toHaveText(`${row.position}º`);
}

test("cada conta vê só a própria dupla ao trocar de usuário, sem vazar estado entre logins", async ({ page }) => {
  test.setTimeout(90_000);
  await mockLeagueWithAccounts(page, fictionalLeague);
  await page.goto("/login");

  const sequence: Array<[player: string, team: string]> = [
    ["Jogador 1", "Dupla 1"],
    ["Jogador 5", "Dupla 3"],
    ["Jogador 13", "Dupla 7"],
    ["Jogador 10", "Dupla 5"],
  ];
  for (const [player, team] of sequence) {
    await loginAs(page, player);
    await expectOwnTeamEverywhere(page, fictionalLeague, team);
    await logout(page);
  }

  // Atualizar a página mantém a conta certa e recarrega os dados dela.
  await loginAs(page, "Jogador 5");
  await expectOwnTeamEverywhere(page, fictionalLeague, "Dupla 3");
  await page.reload();
  await expectOwnTeamEverywhere(page, fictionalLeague, "Dupla 3");
});

test("Pigas & Diguinho e Digão & Rafinha veem só os próprios números ao trocar de conta", async ({ page }) => {
  test.setTimeout(90_000);
  await mockLeagueWithAccounts(page, realSnapshotLeague);
  await page.goto("/login");
  // A tela de login lista exatamente os 14 participantes oficiais.
  await page.getByRole("button", { name: "Ver lista de nomes" }).click();
  await expect(page.locator(".profile-card .profile-name")).toHaveCount(14);
  await expect(page.locator(".profile-name", { hasText: /^Rafael$/ })).toHaveCount(0);
  await page.reload();

  await loginAs(page, "Pigas");
  await expectOwnTeamEverywhere(page, realSnapshotLeague, "Pigas & Diguinho");
  await openMenu(page, "Minha Dupla");
  await expect(page.locator(".team-performance dd")).toHaveText(["5", "2", "0", "+3"]);
  await logout(page);

  // Digão (pai do Diguinho) é outra pessoa, com outra dupla e outros números.
  await loginAs(page, "Digão");
  await expectOwnTeamEverywhere(page, realSnapshotLeague, "Digão & Rafinha");
  await openMenu(page, "Minha Dupla");
  await expect(page.locator(".team-performance dd")).toHaveText(["4", "1", "1", "+1"]);
  await page.reload();
  await expectOwnTeamEverywhere(page, realSnapshotLeague, "Digão & Rafinha");
  await logout(page);

  await loginAs(page, "Diguinho");
  await expectOwnTeamEverywhere(page, realSnapshotLeague, "Pigas & Diguinho");
  await logout(page);

  await loginAs(page, "Rafinha");
  await expectOwnTeamEverywhere(page, realSnapshotLeague, "Digão & Rafinha");
});

// ---------- Minha Dupla: perfil da dupla, desempenho e histórico ----------
/** Partidas com placar lançado; as demais ficam pendentes. Chave = índice em `matches`. */
async function routeTeamMatches(page: Page, finished: Record<number, { setsA: number; setsB: number; queuePosition: number }>) {
  await page.route((url) => url.pathname.endsWith("/api/matches"), (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(matches.map((match, index) => finished[index] ? { ...match, result: { setsA: finished[index].setsA, setsB: finished[index].setsB }, status: "realizado", queuePosition: finished[index].queuePosition } : match)),
  }));
}

test("Minha Dupla mostra os três jogos encerrados mais recentes e leva a Jogos", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  // Dupla 1 joga os índices 0 a 5 (contra as Duplas 2 a 7); o índice 6 é Dupla 2 x Dupla 3.
  await routeTeamMatches(page, {
    0: { setsA: 2, setsB: 0, queuePosition: 1 },
    1: { setsA: 1, setsB: 2, queuePosition: 2 },
    2: { setsA: 2, setsB: 1, queuePosition: 3 },
    3: { setsA: 0, setsB: 2, queuePosition: 4 },
    6: { setsA: 2, setsB: 0, queuePosition: 9 },
  });
  await page.goto("/minha-dupla");
  const history = page.getByRole("region", { name: "Histórico da dupla" });
  await expect(history.locator(".team-results-row")).toHaveCount(3);
  // Do mais recente para o mais antigo; o jogo mais antigo (2 × 0 na Dupla 2) fica de fora,
  // e o jogo de outras duplas nunca entra.
  await expect(history.locator(".team-results-opponent strong")).toHaveText(["Dupla 5", "Dupla 4", "Dupla 3"]);
  await expect(history.locator(".team-results-score")).toHaveText(["0 × 2", "2 × 1", "1 × 2"]);
  await expect(history.locator(".team-results-outcome")).toHaveText(["Derrota", "Vitória", "Derrota"]);
  await expect(history.locator(".team-results-points")).toHaveText(["+0 pts", "+2 pts", "+1 pt"]);
  const link = history.getByRole("link", { name: "Ver todos os jogos" });
  await expect(link).toHaveAttribute("href", "/jogos");
  await link.click();
  await expect(page).toHaveURL(/\/jogos$/);
  await expect(page.getByRole("heading", { name: "Jogos", level: 1 })).toBeVisible();
});

test("Minha Dupla sem jogo encerrado mostra o estado vazio e nenhum placar", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.goto("/minha-dupla");
  const history = page.getByRole("region", { name: "Histórico da dupla" });
  await expect(history.getByText("A campanha ainda não começou", { exact: true })).toBeVisible();
  await expect(history.locator(".team-results-row, .team-results-score")).toHaveCount(0);
  await expect(history).not.toContainText(/Vitória|Derrota|pts|×/);
  await expect(history.getByRole("link", { name: "Ver todos os jogos" })).toHaveAttribute("href", "/jogos");
});

test("Minha Dupla continua de pé quando a busca de jogos falha", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route((url) => url.pathname.endsWith("/api/matches"), (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Falha simulada" }) }));
  await page.goto("/minha-dupla");
  await expect(page.locator(".team-profile-name")).toHaveText("Dupla 1");
  await expect(page.locator(".team-performance dd")).toHaveText(["0", "0", "0", "0"]);
  const history = page.getByRole("region", { name: "Histórico da dupla" });
  await expect(history.getByText("Histórico indisponível no momento", { exact: true })).toBeVisible();
  await expect(history.locator(".team-results-row")).toHaveCount(0);
});

test("Minha Dupla mostra o nome da dupla uma vez, a ordem aprovada e nenhum selo extra", async ({ page }) => {
  await mockCoreApi(page, "jogador", true);
  await page.goto("/minha-dupla");
  const root = page.locator(".my-team");
  await expect(root.getByRole("heading", { name: "Minha Dupla", level: 1 })).toBeVisible();
  await expect(root.locator(".page-header p")).toHaveText("Truco do Novo · 5ª Edição");
  await expect(root.getByRole("heading", { name: "Dupla 1", level: 2 })).toBeVisible();
  await expect(root.getByText("Dupla 1", { exact: true })).toHaveCount(1);
  // Cabeçalho, card da dupla, desempenho e histórico, nesta ordem.
  expect(await root.locator(":scope > *").evaluateAll((blocks) => blocks.map((block) => block.className.split(" ")[0]))).toEqual(["page-header", "team-profile", "team-performance", "team-results"]);
  const profile = page.getByRole("region", { name: "Perfil da sua dupla" });
  await expect(profile.getByText("Força 1 de 5", { exact: true })).toBeVisible();
  await expect(profile.locator(".team-profile-star")).toHaveCount(5);
  await expect(profile.locator(".team-profile-star-lit")).toHaveCount(1);
  await expect(profile.locator(".team-profile-group-mark")).toHaveText("Grupo Único");
  await expect(profile.locator(".team-profile-position")).toHaveText("1º lugar");
  await expect(profile.getByRole("link", { name: "Ver meu grupo" })).toHaveAttribute("href", "/grupos");
  // O único selo da página é o resultado do jogo encerrado, no histórico.
  await expect(root.locator(".badge")).toHaveText(["Vitória"]);
  await expect(root).not.toContainText(/Zona de|Dupla aprovada|Aprovação pendente|Cabeça de chave|Saldo de sets/i);
  await expect(page.locator(".team-performance dt")).toHaveText(["Pontos", "Vitórias", "Derrotas", "Saldo de quedas"]);
});

test("Minha Dupla sem grupo mostra travessões, nenhuma posição e só o selo de aprovação pendente", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route((url) => url.pathname.endsWith("/api/teams"), (route) => route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(teams.map((team, index) => index === 0 ? { ...team, status: "pendente", groupId: null, strength: 0, seeded: true } : team)) })
    : route.fallback());
  await page.goto("/minha-dupla");
  const profile = page.getByRole("region", { name: "Perfil da sua dupla" });
  await expect(profile.getByText("Força a definir", { exact: true })).toBeVisible();
  await expect(profile.locator(".team-profile-star, .team-profile-position")).toHaveCount(0);
  await expect(profile.getByText("Grupo a definir", { exact: true })).toBeVisible();
  await expect(profile.getByRole("link", { name: "Ver grupos" })).toHaveAttribute("href", "/grupos");
  await expect(profile.locator(".badge")).toHaveText(["Aprovação pendente"]);
  await expect(page.locator(".team-performance dd")).toHaveText(["—", "—", "—", "—"]);
  await expect(page.locator(".my-team")).not.toContainText(/Zona de|Dupla aprovada|Cabeça de chave/i);
});

test("home explica quando falta aplicar a migration das duplas e oferece nova tentativa", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route("**/api/teams", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ message: "A edição precisa receber a migration 202610050001_manual_edition_participation.sql no Supabase antes de carregar as duplas. Avise o administrador do campeonato." }),
  }));
  await page.goto("/inicio");
  await expect(page.getByRole("heading", { name: "Falta concluir uma atualização do campeonato" })).toBeVisible();
  await expect(page.getByText(/Isso não significa que sua dupla foi apagada/)).toHaveCount(0);
  await expect(page.getByText(/migration 202610050001_manual_edition_participation.sql/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
});

test("admin não gera mais o mata-mata: as fases nascem sozinhas e ele só registra ou corrige placar", async ({ page }) => {
  await mockCoreApi(page, "admin");
  let generateCalls = 0;
  await page.route("**/api/bracket/generate", (route) => {
    generateCalls += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  const generateButton = page.getByRole("button", { name: /Gerar mata-mata/ });
  await page.goto("/admin/mata-mata");
  await expect(page.getByText(/As quartas nascem sozinhas quando os 21 jogos do grupo terminarem/)).toBeVisible();
  await expect(page.locator(".ko-match")).toHaveCount(6);
  await expect(generateButton).toHaveCount(0);

  // Grupos encerrados e sem empate: nada a gerar, a tela só explica.
  await page.route("**/api/groups/*/standings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(finalStandings()) }));
  await page.reload();
  await expect(page.getByText(/As quartas nascem sozinhas a partir da classificação final: não é preciso gerar nada/)).toBeVisible();
  await expect(generateButton).toHaveCount(0);
  await expect(page.locator(".admin-bracket-tie")).toHaveCount(0);

  // Empate exato: a única pendência do administrador, com o caminho para decidir.
  await page.route("**/api/groups/*/standings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(finalStandings(["team-2", "team-3"])) }));
  await page.reload();
  await expect(page.getByText(/As quartas nascem sozinhas logo depois que você decidir as posições/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Decidir o empate em Grupos" })).toHaveAttribute("href", "/admin/grupos");
  await expect(generateButton).toHaveCount(0);

  // Chaveamento já criado: o administrador registra o que falta e corrige o que já saiu.
  await mockKnockout(page, 1, "admin");
  await page.reload();
  await expect(page.getByText(/As fases nascem sozinhas/)).toBeVisible();
  // Quartas 1 disputada: faltam a Quartas 2 e a Semifinal 2, que já nasceu.
  await expect(page.getByRole("button", { name: "Registrar resultado" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Corrigir resultado" })).toHaveCount(1);
  await expect(generateButton).toHaveCount(0);
  expect(generateCalls).toBe(0);
});

test("jogador sem sessão é encaminhado ao login ao acessar área administrativa", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto("/admin/duplas");
  await expect(page).toHaveURL(/\/login$/);
});

test("jogador autenticado não entra em rota administrativa", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.goto("/admin/duplas");
  await expect(page).toHaveURL(/\/inicio$/);
});

test("sessão expirada é renovada antes das consultas do jogador", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.addInitScript((expiredToken) => {
    const session = JSON.parse(localStorage.getItem("truco-do-novo:session")!);
    session.token = expiredToken;
    localStorage.setItem("truco-do-novo:session", JSON.stringify(session));
  }, testToken(true));
  const headers: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/") && !request.url().includes("/roster")) headers.push(request.headers().authorization ?? "");
  });
  await page.goto("/inicio");
  await expect(page.getByRole("heading", { name: "Olá, Jogador 1!" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(headers.length).toBeGreaterThan(0);
  for (const header of headers) {
    const payload = JSON.parse(Buffer.from(header.replace("Bearer ", "").split(".")[1], "base64url").toString());
    expect(payload.version).toBe("renewed");
  }
  const refreshToken = await page.evaluate(() => JSON.parse(localStorage.getItem("truco-do-novo:session")!).refreshToken);
  expect(refreshToken).toBe("renewed-test-refresh");
});

test("sessão que não pode ser renovada volta ao login", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.addInitScript((expiredToken) => {
    const session = JSON.parse(localStorage.getItem("truco-do-novo:session")!);
    session.token = expiredToken;
    localStorage.setItem("truco-do-novo:session", JSON.stringify(session));
  }, testToken(true));
  await page.route("**/auth/v1/token**", (route) => route.fulfill({
    status: 400, contentType: "application/json", body: JSON.stringify({ code: "refresh_token_not_found", message: "Invalid refresh token" }),
  }));
  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem("truco-do-novo:session"))).toBeNull();
});

test("Hall da Fama mostra somente a edição histórica armazenada", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route("**/rest/v1/truco_history**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ truco_id: "hist-4", edition: 4, name: "4ª Edição", year: 2025, final_result: "2x1", notes: "", champion: { name: "Campeões" , truco_team_members: [{ position: 1, truco_players: { name: "Campeão 1" } }, { position: 2, truco_players: { name: "Campeão 2" } }] }, runner_up: null }]) }));
  await page.route("**/rest/v1/truco_championships**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ edition: 5, year: 2026 }]) }));
  await page.goto("/hall-da-fama");
  await expect(page.getByRole("heading", { name: "Hall da Fama" })).toBeVisible();
  await expect(page.getByText("Campeão 1").first()).toBeVisible();
  await expect(page.locator(".champions-ranking")).toHaveCount(0);
  await expect(page.getByText("Placar da final")).toBeVisible();
});

// ---------- Hall da Fama: linha do tempo por edições ----------

const hallDuo = (first: string, second: string) => ({ name: `${first} & ${second}`, truco_team_members: [{ position: 1, truco_players: { name: first } }, { position: 2, truco_players: { name: second } }] });
/** Histórico fictício: a edição N foi vencida por "Campeão 2N-1" e "Campeão 2N", no ano 2021 + N. */
const hallHistory = (count: number) => Array.from({ length: count }, (_, index) => ({
  truco_id: `hist-${index + 1}`, edition: index + 1, name: `${index + 1}ª Edição`, year: 2022 + index, final_result: index === 2 ? "2x1" : null, notes: "",
  champion: hallDuo(`Campeão ${index * 2 + 1}`, `Campeão ${index * 2 + 2}`), runner_up: index === 2 ? hallDuo("Vice 1", "Vice 2") : null,
}));

async function openHall(page: Page, closedEditions: number, currentEdition: number) {
  await mockCoreApi(page, "jogador");
  // Fora de ordem de propósito: quem ordena os capítulos é a tela.
  await page.route("**/rest/v1/truco_history**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(hallHistory(closedEditions).reverse()) }));
  await page.route("**/rest/v1/truco_championships**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ edition: currentEdition, year: 2026 }]) }));
  await page.goto("/hall-da-fama");
  await expect(page.getByRole("heading", { name: "Hall da Fama", level: 1 })).toBeVisible();
}

test("Hall da Fama conta a história por edições, da 1ª até a edição em disputa", async ({ page }) => {
  await openHall(page, 4, 5);
  const chapters = page.locator("ol.hof-chapters > li");
  await expect(chapters).toHaveCount(5);
  await expect(chapters.getByRole("heading", { level: 2 })).toHaveText(["1ªEdição", "2ªEdição", "3ªEdição", "4ªEdição", "5ªEdição"]);
  await expect(chapters.nth(2).getByRole("heading", { name: "3ª Edição", exact: true })).toBeVisible();
  // Organização só por edições: nenhum ano na linha do tempo, nem em rótulos acessíveis.
  const timelineText = await page.locator(".hof-timeline").evaluate((section) => [section.textContent ?? "", ...Array.from(section.querySelectorAll("[aria-label]")).map((element) => element.getAttribute("aria-label") ?? "")].join(" "));
  expect(timelineText).not.toMatch(/20\d\d/);

  // Edições encerradas: campeões reais em destaque.
  await expect(chapters.nth(0)).toContainText("Campeões");
  await expect(chapters.nth(0).locator(".hof-duo strong")).toHaveText(["Campeão 1", "Campeão 2"]);
  await expect(chapters.nth(3).locator(".hof-duo strong")).toHaveText(["Campeão 7", "Campeão 8"]);
  await expect(chapters.nth(3).locator(".opening-trophy-svg")).toContainText("4ª EDIÇÃO");

  // Capítulo em aberto: sem campeão antecipado, sem dupla, sem metal e sem detalhe.
  const open = chapters.nth(4);
  await expect(open).toContainText("Em disputa");
  await expect(open).toContainText("A próxima história será escrita");
  await expect(open).not.toContainText("Campe");
  await expect(open.locator(".hof-duo, .player-avatar, .opening-trophy-svg")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ver detalhes da 5ª edição" })).toHaveCount(0);

  // Por padrão o detalhe mostra a edição encerrada mais recente; o botão troca a edição.
  const detail = page.locator(".history-detail");
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText("4ª Edição");
  await page.getByRole("button", { name: "Ver detalhes da 3ª edição" }).click();
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText("3ª Edição");
  await expect(detail.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(detail.locator(".history-champion")).toContainText("Campeão 5");
  await expect(detail.locator(".history-champion")).toContainText("Campeão 6");
  await expect(detail).toContainText("Vice 1 & Vice 2");
  await expect(detail.locator(".history-result")).toContainText("2x1");
  await expect(detail).toBeInViewport();
  await expect(detail).not.toContainText(/20\d\d/);
  // Sem ranking nem contagem de títulos aqui: isso mora em Maiores Campeões.
  await expect(page.locator(".champions-ranking, .champions-podium-place")).toHaveCount(0);
  await expect(page.locator(".hof")).not.toContainText(/título/i);
  await expect(page.getByRole("link", { name: "Ranking de maiores campeões" })).toHaveAttribute("href", "/maiores-campeoes");

  // Voltar devolve o foco ao capítulo de onde o detalhe saiu.
  await page.getByRole("button", { name: "Voltar à linha do tempo" }).click();
  await expect(page.getByRole("button", { name: "Ver detalhes da 3ª edição" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Ver detalhes da 3ª edição" })).toBeInViewport({ ratio: 1 });
});

test("Hall da Fama abre o próximo capítulo sozinho quando o histórico cresce", async ({ page }) => {
  await openHall(page, 5, 6);
  const chapters = page.locator("ol.hof-chapters > li");
  await expect(chapters).toHaveCount(6);
  await expect(chapters.nth(4).locator(".hof-duo strong")).toHaveText(["Campeão 9", "Campeão 10"]);
  await expect(chapters.nth(5).getByRole("heading", { name: "6ª Edição", exact: true })).toHaveCount(1);
  await expect(chapters.nth(5)).toContainText("Em disputa");
  await expect(chapters.nth(5).locator(".hof-duo")).toHaveCount(0);
  await expect(page.locator(".history-detail").getByRole("heading", { level: 2 })).toHaveText("5ª Edição");
});

test("Hall da Fama com movimento reduzido mostra todos os capítulos prontos, sem trilha presa", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHall(page, 4, 5);
  const chapters = page.locator("ol.hof-chapters > li");
  await expect(chapters).toHaveCount(5);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  const state = await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>(".hof-timeline")!;
    const hidden = Array.from(section.querySelectorAll<HTMLElement>(".hof-chapter *")).filter((element) => !element.closest("svg") && getComputedStyle(element).opacity !== "1");
    const masked = Array.from(section.querySelectorAll<HTMLElement>(".hof-mask > span")).filter((element) => getComputedStyle(element).transform !== "none");
    return {
      live: section.hasAttribute("data-live"),
      mode: getComputedStyle(section).getPropertyValue("--hof-mode").trim(),
      pin: getComputedStyle(section.querySelector(".hof-pin")!).position,
      track: getComputedStyle(section.querySelector(".hof-track")!).transform,
      fill: getComputedStyle(section.querySelector(".hof-rail-fill")!).transform,
      hidden: hidden.length,
      masked: masked.length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  // Linha inteira desenhada (escala 1), nada escondido e nenhuma trilha presa ou deslocada.
  expect(state).toEqual({ live: false, mode: "", pin: "relative", track: "none", fill: "matrix(1, 0, 0, 1, 0, 0)", hidden: 0, masked: 0, overflow: 0 });
  for (const edition of [1, 2, 3, 4]) await expect(page.getByRole("button", { name: `Ver detalhes da ${edition}ª edição` })).toBeVisible();
  await expect(chapters.nth(4)).toContainText("Em disputa");
  await expect(page.getByRole("button", { name: "Próxima edição" })).toHaveCount(0);
});

test("Hall da Fama: a rolagem conduz a trilha no desktop e o celular empilha os capítulos", async ({ page }) => {
  await openHall(page, 4, 5);
  const section = page.locator(".hof-timeline");
  const chapters = page.locator("ol.hof-chapters > li");
  await expect(section).toHaveAttribute("data-live", "true");
  const pinned = await section.evaluate((element) => getComputedStyle(element).getPropertyValue("--hof-mode").trim() === "pinned");
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const progress = async () => Number(await section.getAttribute("data-progress"));
  const trackX = () => page.locator(".hof-track").evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41);
  const boxes = () => chapters.evaluateAll((items) => items.map((item) => { const rect = item.getBoundingClientRect(); return { x: Math.round(rect.left), y: Math.round(rect.top + window.scrollY) }; }));
  expect(await overflow()).toBeLessThanOrEqual(0);

  if (!pinned) {
    // Celular: trilho vertical, capítulos um abaixo do outro, sem trilha horizontal nem controles.
    const layout = await boxes();
    expect(new Set(layout.map((box) => box.x)).size).toBe(1);
    for (let index = 1; index < layout.length; index += 1) expect(layout[index].y).toBeGreaterThan(layout[index - 1].y);
    expect(await trackX()).toBe(0);
    await expect(page.getByRole("button", { name: "Próxima edição" })).toHaveCount(0);
    // A linha cresce com a rolagem e os capítulos revelam ao entrar na tela.
    await expect(chapters.nth(0)).toHaveAttribute("data-revealed", "true");
    const before = await progress();
    await chapters.nth(4).scrollIntoViewIfNeeded();
    await expect(chapters.nth(4)).toHaveAttribute("data-revealed", "true");
    await expect.poll(progress).toBeGreaterThan(before);
    expect(await overflow()).toBeLessThanOrEqual(0);
    return;
  }

  // Desktop: capítulos lado a lado, alternando acima e abaixo da linha.
  const layout = await boxes();
  for (let index = 1; index < layout.length; index += 1) expect(layout[index].x).toBeGreaterThan(layout[index - 1].x);
  await expect(chapters.nth(0)).toHaveClass(/hof-chapter-above/);
  await expect(chapters.nth(1)).toHaveClass(/hof-chapter-below/);
  await expect(page.locator(".hof-progress")).toHaveText("Edição 1 de 5");
  await expect(page.getByRole("button", { name: "Edição anterior" })).toBeDisabled();
  await expect(section).toHaveAttribute("data-progress", "0.000");
  expect(await trackX()).toBe(0);

  // Rolar a página na vertical avança a trilha na horizontal.
  await page.mouse.move(700, 400);
  await page.mouse.wheel(0, 320);
  await expect.poll(progress).toBeGreaterThan(0);
  await expect.poll(trackX).toBeLessThan(-100);
  expect(await overflow()).toBeLessThanOrEqual(0);

  // Marcos e setas levam a rolagem até o capítulo.
  await page.getByRole("button", { name: "Ir para a 4ª edição" }).click();
  await expect(page.locator(".hof-progress")).toHaveText("Edição 4 de 5");
  await expect(page.getByRole("button", { name: "Ver detalhes da 4ª edição" })).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "Próxima edição" }).click();
  await expect(page.locator(".hof-progress")).toHaveText("Edição 5 de 5");
  await expect(page.getByRole("button", { name: "Próxima edição" })).toBeDisabled();
  await expect(section).toHaveAttribute("data-progress", "1.000");
  await expect(chapters.nth(4)).toHaveAttribute("data-revealed", "true");
  await expect(page.getByText("A próxima história será escrita")).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "Edição anterior" }).click();
  await expect(page.locator(".hof-progress")).toHaveText("Edição 4 de 5");

  // Foco por teclado num capítulo fora da tela traz o capítulo para a área visível.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(section).toHaveAttribute("data-progress", "0.000");
  const target = page.getByRole("button", { name: "Ver detalhes da 4ª edição" });
  await expect(target).not.toBeInViewport();
  await page.getByRole("link", { name: "Ranking de maiores campeões" }).focus();
  for (let presses = 0; presses < 12 && !(await target.evaluate((element) => element === document.activeElement)); presses += 1) await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport({ ratio: 1 });
  expect(await overflow()).toBeLessThanOrEqual(0);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
});

test("abertura usa conquistas registradas e continua para a campanha", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.goto("/");
  await expect(page).toHaveURL(/\/abertura$/);
  await expect(page.getByRole("heading", { name: "Bora fazer história e levar esse caneco para casa?" })).toBeVisible();
  await expect(page.locator(".champions-podium-place")).toHaveCount(3);
  await expect(page.locator(".champions-podium-place-1")).toContainText("2 títulos");
  await expect(page.locator(".champions-podium-place-2")).toHaveCount(2);
  await page.getByRole("button", { name: "Entrar na edição atual" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  const hero = page.getByRole("region", { name: "Resumo da sua dupla" });
  await expect(hero.getByRole("heading", { name: "Dupla 1", exact: true })).toBeVisible();
  await expect(hero.locator(".home-hero-member strong")).toHaveText(["Jogador 1", "Jogador 2"]);
  await expect(hero.locator(".home-hero-role")).toHaveText(["Você", "Seu parceiro"]);
  await expect(hero.getByText("Força 1 de 5", { exact: true })).toBeVisible();
  await expect(hero.locator(".home-hero-star-lit")).toHaveCount(1);
  await expect(hero.locator(".home-hero-group")).toHaveText("Grupo Único");
  await expect(hero.getByRole("link", { name: "Ver meu grupo" })).toHaveAttribute("href", "/grupos");
  // O card não repete posição, zona, aprovação nem números da campanha.
  await expect(hero).not.toContainText(/lugar|Zona|aprovada|Cabeça de chave|Pontos|Vitórias|Saldo/i);
  const road = page.getByRole("region", { name: "Rumo ao campeonato" });
  await expect(road.locator("time")).toHaveText("25/10/2026 · 12h");
  await expect(road.locator(".home-road-status")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Próximo confronto" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Resumo da campanha" })).toHaveCount(0);
  await expect(page.locator(".home-banner, .team-performance, .team-profile")).toHaveCount(0);
  await page.goto("/");
  await expect(page).toHaveURL(/\/inicio$/);
});

test("ranking preserva empates e jogos de outras duplas não oferecem edição", async ({ page }) => {
  await mockCoreApi(page, "jogador", true);
  await page.goto("/maiores-campeoes");
  await expect(page.locator(".champions-podium-place-2")).toHaveCount(2);
  // As três campeãs do ranking simulado estão no pódio: a página não tem lista, contadores
  // nem o card da dupla "na corrida".
  await expect(page.locator(".champions-podium-place")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Também levantaram o caneco" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Demais duplas|Duplas no ranking|na corrida/ })).toHaveCount(0);
  await expect(page.locator(".major-hero-stats, .major-mine, .major-row")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver o histórico por edição" })).toHaveAttribute("href", "/hall-da-fama");
  await page.goto("/jogos");
  // Jogos entre outras duplas (Dupla 2 a 7): nenhum oferece lançar ou editar.
  await page.getByRole("tab", { name: "Todas as Rodadas" }).click();
  const others = page.locator(".round-match:not(.round-match-mine)");
  await expect(others).toHaveCount(15);
  await expect(others.getByRole("button", { name: /Lançar resultado|Editar resultado/ })).toHaveCount(0);
});

test("Maiores Campeões mostra só duplas com título e só dá metal a quem tem título", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route("**/api/history/major-champions", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
    { key: "historical-1", players: ["Campeão 1", "Campeão 2"], name: "Campeão 1 & Campeão 2", titles: 3, editions: [1, 3, 4], rank: 1 },
    { key: "historical-2", players: ["Campeão 3", "Campeão 4"], name: "Campeão 3 & Campeão 4", titles: 1, editions: [2], rank: 2 },
    { key: "current-1", players: ["Jogador 1", "Jogador 2"], name: "Jogador 1 & Jogador 2", titles: 0, editions: [], rank: 3 },
    { key: "current-2", players: ["Jogador 3", "Jogador 4"], name: "Jogador 3 & Jogador 4", titles: 0, editions: [], rank: 3 },
  ]) }));
  await page.goto("/maiores-campeoes");
  const podium = page.locator(".champions-podium-real");
  const main = page.locator(".major-champions-page");
  // Pódio: só quem tem título. O 3º lugar sem título não sobe nem ganha destaque.
  await expect(podium.locator(".champions-podium-place")).toHaveCount(2);
  await expect(podium.locator(".champions-podium-place-1")).toContainText("3 títulos");
  await expect(podium.locator(".champions-podium-place-3")).toHaveCount(0);
  await expect(podium.locator(".champions-podium-place-1").getByRole("list", { name: "Edições conquistadas" }).getByRole("listitem")).toHaveText(["1ª edição", "3ª edição", "4ª edição"]);
  // Um caneco de cada metal, com gradientes próprios (ids únicos por instância).
  expect(await page.locator(".champions-podium-cup > svg linearGradient[id^='ot-gold-']").evaluateAll((nodes) => new Set(nodes.map((node) => node.id)).size === nodes.length)).toBe(true);
  // Duplas sem título não aparecem em lugar nenhum da página, nem a do próprio jogador.
  await expect(main).not.toContainText("Jogador 1");
  await expect(main).not.toContainText("Jogador 3");
  await expect(main).not.toContainText("Sua dupla");
  await expect(main).not.toContainText(/0\s*títulos/);
  await expect(page.getByRole("heading", { name: /Demais duplas|Duplas no ranking|na corrida/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Também levantaram o caneco" })).toHaveCount(0);
  await expect(page.locator(".major-hero-stats, .major-mine, .major-row")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver meus jogos" })).toHaveCount(0);
});

test("Maiores Campeões lista a campeã fora do pódio sem repetir ninguém e marca a dupla do jogador", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route("**/api/history/major-champions", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
    { key: "historical-1", players: ["Campeão 1", "Campeão 2"], name: "Campeão 1 & Campeão 2", titles: 3, editions: [1, 3, 4], rank: 1 },
    { key: "historical-2", players: ["Campeão 3", "Campeão 4"], name: "Campeão 3 & Campeão 4", titles: 2, editions: [2, 6], rank: 2 },
    { key: "historical-3", players: ["Campeão 5", "Campeão 6"], name: "Campeão 5 & Campeão 6", titles: 2, editions: [5, 7], rank: 2 },
    { key: "current-1", players: ["Jogador 1", "Jogador 2"], name: "Jogador 1 & Jogador 2", titles: 1, editions: [8], rank: 4 },
    { key: "current-2", players: ["Jogador 3", "Jogador 4"], name: "Jogador 3 & Jogador 4", titles: 0, editions: [], rank: 5 },
  ]) }));
  await page.goto("/maiores-campeoes");
  const podium = page.locator(".champions-podium-real");
  await expect(podium.locator(".champions-podium-place")).toHaveCount(3);
  await expect(podium.locator(".champions-podium-place-1")).toHaveCount(1);
  await expect(podium.locator(".champions-podium-place-2")).toHaveCount(2);
  await expect(podium).not.toContainText("Jogador 1");
  // A campeã em 4º não some: aparece na seção discreta, com posição, títulos e plaquinha.
  const also = page.getByRole("region", { name: "Também levantaram o caneco" });
  await expect(also.getByRole("heading", { name: "Também levantaram o caneco" })).toBeVisible();
  const rows = also.getByRole("listitem").filter({ has: page.locator(".major-also-rank") });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Jogador 1 & Jogador 2");
  await expect(rows.getByLabel("4º lugar")).toHaveText("4º");
  await expect(rows.locator(".major-also-titles")).toHaveText(/^1\s*título$/);
  await expect(rows.getByRole("list", { name: "Edições conquistadas" }).getByRole("listitem")).toHaveText(["8ª edição"]);
  await expect(rows).toContainText("Sua dupla");
  // Ninguém do pódio se repete ali, e a dupla sem título continua fora da página.
  for (const name of ["Campeão 1", "Campeão 3", "Campeão 5"]) await expect(also).not.toContainText(name);
  await expect(page.locator(".major-champions-page")).not.toContainText("Jogador 3");
  await expect(page.getByRole("heading", { name: /na corrida/ })).toHaveCount(0);
});

test("Maiores Campeões sem título registrado mostra o estado vazio, sem palco", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route("**/api/history/major-champions", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
    { key: "current-1", players: ["Jogador 1", "Jogador 2"], name: "Jogador 1 & Jogador 2", titles: 0, editions: [], rank: 1 },
  ]) }));
  await page.goto("/maiores-campeoes");
  await expect(page.getByRole("heading", { name: "Maiores Campeões", level: 1 })).toBeVisible();
  await expect(page.getByText("O ranking está começando")).toBeVisible();
  await expect(page.locator(".major-gallery, .major-stage, .champions-podium-real, .major-also")).toHaveCount(0);
  await expect(page.locator(".major-champions-page")).not.toContainText("Jogador 1");
});

test("abertura sem títulos não inventa campeões e não impede continuar", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route("**/api/history/major-champions", route => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto("/abertura");
  await expect(page.getByText(/Os campeões aparecerão aqui quando/)).toBeVisible();
  await expect(page.locator(".champions-podium-place")).toHaveCount(0);
  await page.getByRole("button", { name: "Entrar na edição atual" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
});

// ---------- Início: card da dupla e faixa "Rumo ao campeonato" ----------

test("Início de outra dupla leva ao grupo único e mantém a dupla ao recarregar", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.addInitScript(() => {
    const session = JSON.parse(localStorage.getItem("truco-do-novo:session")!);
    session.user.teamId = "team-7";
    session.user.playerId = "player-13";
    localStorage.setItem("truco-do-novo:session", JSON.stringify(session));
  });
  await page.goto("/inicio");
  const hero = page.getByRole("region", { name: "Resumo da sua dupla" });
  await expect(hero.locator(".home-hero-name")).toHaveText("Dupla 7");
  await expect(hero.locator(".home-hero-member strong")).toHaveText(["Jogador 13", "Jogador 14"]);
  await expect(hero.locator(".home-hero-role")).toHaveText(["Você", "Seu parceiro"]);
  await expect(hero.getByText("Força 2 de 5", { exact: true })).toBeVisible();
  await expect(hero.locator(".home-hero-group")).toHaveText("Grupo Único");

  // Recarregar mantém a mesma dupla, sem rastro de outra.
  await page.reload();
  await expect(hero.locator(".home-hero-name")).toHaveText("Dupla 7");
  await expect(hero.locator(".home-hero-member strong")).toHaveText(["Jogador 13", "Jogador 14"]);
  await expect(page.locator(".player-home")).not.toContainText("Dupla 1");

  await hero.getByRole("link", { name: "Ver meu grupo" }).click();
  await expect(page).toHaveURL(/\/grupos$/);
  await expect(page.getByRole("heading", { name: "Grupo Único" })).toBeVisible();
  await expect(page.locator(".standings-row-mine")).toContainText("Dupla 7");
});

test("Início sem força nem grupo mostra a ausência, e sem dupla mantém a faixa do campeonato", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route("**/api/teams", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(teams.map((team, index) => index === 0 ? { ...team, groupId: null, strength: undefined } : team)) }));
  await page.goto("/inicio");
  const hero = page.getByRole("region", { name: "Resumo da sua dupla" });
  await expect(hero.getByText("Força a definir", { exact: true })).toBeVisible();
  await expect(hero.locator(".home-hero-star")).toHaveCount(0);
  await expect(hero.getByText("Grupo a definir", { exact: true })).toBeVisible();
  await expect(hero.getByRole("link", { name: "Ver grupos" })).toHaveAttribute("href", "/grupos");

  await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem("truco-do-novo:session")!);
    session.user.teamId = null;
    localStorage.setItem("truco-do-novo:session", JSON.stringify(session));
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sua dupla está a caminho" })).toBeVisible();
  await expect(hero).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Rumo ao campeonato" }).locator("time")).toHaveText("25/10/2026 · 12h");
});

const HOME_DASHBOARD = { totalPlayers: 20, totalTeams: 10, pendingApprovals: 0, approvedTeams: 10, drawStatus: "realizado", matchesPlayed: 0, matchesPending: 20, currentPhase: "Fase de Grupos", nextMatches: [] };

/** Início com relógio, cadeado e campeão controlados. `dashboard: null` simula o painel fora do ar. */
async function openHomeAt(page: Page, options: { now: string; locked: boolean | "erro"; champion?: { teamId: string; teamName: string } | null; dashboard?: null }) {
  await mockCoreApi(page, "jogador");
  await page.route("**/api/matches/lock", (route) => options.locked === "erro"
    ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "falha" }) })
    : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locked: options.locked }) }));
  await page.route("**/api/dashboard", (route) => options.dashboard === null
    ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "falha" }) })
    : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...HOME_DASHBOARD, champion: options.champion ?? null }) }));
  await page.clock.install({ time: new Date(options.now) });
  await page.goto("/inicio");
  const road = page.getByRole("region", { name: "Rumo ao campeonato" });
  await expect(road.locator("time")).toHaveText("25/10/2026 · 12h");
  return road;
}

test("Rumo ao campeonato conta até 25/10 às 12h de São Paulo e troca a contagem pelo estado na hora", async ({ page }) => {
  // 23/10/2026 08:56:50 em São Paulo: faltam 2 dias, 3 horas, 3 minutos e 10 segundos.
  const road = await openHomeAt(page, { now: "2026-10-23T11:56:50Z", locked: true });
  const timer = road.getByRole("timer");
  await page.clock.pauseAt(new Date("2026-10-23T11:57:00Z"));
  await expect(road.locator(".home-road-status")).toHaveText("Aguardando início");
  await expect(timer.locator("b")).toHaveText(["2", "03", "03", "00"]);
  await expect(road.getByText("Resultados bloqueados", { exact: true })).toBeVisible();
  // Só os números mudam: um tique por segundo.
  await page.clock.runFor(4000);
  await expect(timer.locator("b")).toHaveText(["2", "03", "02", "56"]);

  // Na hora marcada a contagem some (nada de zeros parados) e o cadeado fechado decide o estado.
  await page.clock.pauseAt(new Date("2026-10-25T14:59:59Z"));
  await expect(timer.locator("b")).toHaveText(["0", "00", "00", "01"]);
  await page.clock.runFor(2000);
  await expect(timer).toHaveCount(0);
  await expect(road.locator(".home-road-status")).toHaveText("Aguardando liberação do administrador");
  await expect(road.locator(".home-road-clock")).toHaveCount(0);
});

test("Rumo ao campeonato: depois do horário o cadeado separa aguardando liberação de em andamento", async ({ page }) => {
  const closed = await openHomeAt(page, { now: "2026-10-25T15:00:00Z", locked: true });
  await expect(closed.locator(".home-road-status")).toHaveText("Aguardando liberação do administrador");
  await expect(closed.getByRole("timer")).toHaveCount(0);
  await expect(closed.getByText("Resultados bloqueados", { exact: true })).toBeVisible();
});

test("Rumo ao campeonato: depois do horário, com o cadeado aberto, a edição está em andamento", async ({ page }) => {
  const open = await openHomeAt(page, { now: "2026-11-02T18:00:00Z", locked: false });
  await expect(open.locator(".home-road-status")).toHaveText("Em andamento");
  await expect(open.getByRole("timer")).toHaveCount(0);
  await expect(open.getByText("Resultados liberados", { exact: true })).toBeVisible();
});

test("Rumo ao campeonato: placares lançados e cadeado aberto não fazem a edição começar antes da hora", async ({ page }) => {
  await mockCoreApi(page, "jogador", true);
  await page.route("**/api/matches/lock", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locked: false }) }));
  await page.clock.install({ time: new Date("2026-10-25T14:58:00Z") });
  await page.goto("/inicio");
  const road = page.getByRole("region", { name: "Rumo ao campeonato" });
  await expect(road.locator(".home-road-status")).toHaveText("Aguardando início");
  await expect(road.getByRole("timer").locator("b").nth(2)).toHaveText("01");
  await expect(road.getByText("Resultados liberados", { exact: true })).toBeVisible();
});

test("Rumo ao campeonato: campeão oficial encerra a edição", async ({ page }) => {
  const ended = await openHomeAt(page, { now: "2026-10-20T12:00:00Z", locked: false, champion: { teamId: "team-3", teamName: "Dupla 3" } });
  await expect(ended.locator(".home-road-status")).toHaveText("Encerrado");
  await expect(ended.getByRole("timer")).toHaveCount(0);
  await expect(ended.locator(".home-road-champion")).toHaveText("Dupla 3");
});

test("Rumo ao campeonato: sem painel não afirma encerrado, e sem resposta do cadeado conta como bloqueado", async ({ page }) => {
  // Painel fora do ar: data, contagem e cadeado continuam.
  const offline = await openHomeAt(page, { now: "2026-10-23T11:56:50Z", locked: false, dashboard: null });
  await expect(offline.locator(".home-road-status")).toHaveText("Aguardando início");
  await expect(offline.getByRole("timer").locator("b").first()).toHaveText("2");
  await expect(offline.getByText("Resultados liberados", { exact: true })).toBeVisible();
  await expect(page.getByText("Não foi possível confirmar a situação da edição.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumo da sua dupla" })).toContainText("Dupla 1");
});

test("Rumo ao campeonato: cadeado sem resposta depois do horário fica aguardando liberação", async ({ page }) => {
  const unknown = await openHomeAt(page, { now: "2026-11-02T18:00:00Z", locked: "erro" });
  await expect(unknown.locator(".home-road-status")).toHaveText("Aguardando liberação do administrador");
  await expect(unknown.getByText("Resultados bloqueados", { exact: true })).toBeVisible();
});

test("Grupos reconhece a dupla do 7º lugar e marca a zona de eliminação", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.addInitScript(() => {
    const session = JSON.parse(localStorage.getItem("truco-do-novo:session")!);
    session.user.teamId = "team-7";
    session.user.playerId = "player-13";
    localStorage.setItem("truco-do-novo:session", JSON.stringify(session));
  });
  await page.goto("/grupos");
  await expect(page.getByText("Sua dupla está aqui")).toBeVisible();
  await expect(page.locator(".standings-row-mine")).toContainText("Dupla 7");
  await expect(page.locator(".standings-row-mine")).toHaveClass(/standings-row-eliminado/);
  await expect(page.getByRole("tab")).toHaveCount(0);
});

test("jogador sem dupla não pode registrar partidas com vagas em aberto", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.addInitScript(() => {
    const session = JSON.parse(localStorage.getItem("truco-do-novo:session")!);
    session.user.teamId = null;
    localStorage.setItem("truco-do-novo:session", JSON.stringify(session));
  });
  await page.route("**/api/matches", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ ...matches[0], teamAId: null, teamBId: null }]) }));
  await page.goto("/jogos");
  await expect(page.getByText("Você não está em uma dupla")).toBeVisible();
  await page.getByRole("tab", { name: "Todas as Rodadas" }).click();
  await expect(page.getByRole("button", { name: /Lançar resultado|Editar resultado/ })).toHaveCount(0);
  await expect(page.locator(".round-match-mine")).toHaveCount(0);
});

const ANIMATED_ROUTES: Array<{ role: "admin" | "jogador"; path: string }> = [
  ...["/inicio", "/abertura", "/hall-da-fama", "/maiores-campeoes", "/minha-dupla", "/grupos", "/jogos", "/mata-mata", "/perfil"].map((path) => ({ role: "jogador" as const, path })),
  ...["/admin", "/admin/jogadores", "/admin/duplas", "/admin/aprovacoes", "/admin/grupos", "/admin/mesas-agora", "/admin/escala", "/admin/jogos", "/admin/mata-mata", "/admin/hall-da-fama", "/admin/configuracoes"].map((path) => ({ role: "admin" as const, path })),
];

const historyDuo = (first: string, second: string) => ({ name: `${first} & ${second}`, truco_team_members: [{ position: 1, truco_players: { name: first } }, { position: 2, truco_players: { name: second } }] });
const ANIMATED_HISTORY = [
  { truco_id: "hist-4", edition: 4, name: "4ª Edição", year: 2025, final_result: "2x1", notes: "", champion: historyDuo("Campeão 1", "Campeão 2"), runner_up: null },
  { truco_id: "hist-3", edition: 3, name: "3ª Edição", year: 2024, final_result: null, notes: "", champion: historyDuo("Campeão 1", "Campeão 2"), runner_up: null },
];

for (const { role, path } of ANIMATED_ROUTES) {
  test(`${path} entra com animação, sem erro e sem overflow`, async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      const started: string[] = [];
      (window as unknown as { __animations: string[] }).__animations = started;
      document.addEventListener("animationstart", (event) => started.push(event.animationName), true);
    });
    // MOTION_THEME=light gera as capturas de MOTION_SHOTS no tema claro.
    if (process.env.MOTION_THEME === "light") {
      await page.addInitScript(() => {
        localStorage.setItem("truco-do-novo:appearance-version", "black-background-v1");
        localStorage.setItem("truco-do-novo:theme", "light");
      });
    }
    await mockCoreApi(page, role);
    await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ totalPlayers: 20, totalTeams: 10, pendingApprovals: 0, approvedTeams: 10, drawStatus: "realizado", matchesPlayed: 0, matchesPending: 20, currentPhase: "Fase de Grupos", nextMatches: [], champion: null }) }));
    await page.route("**/api/schedule/queue", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }));
    await page.route("**/rest/v1/truco_history**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ANIMATED_HISTORY) }));
    await page.route("**/rest/v1/truco_championships**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ edition: 5, year: 2026 }]) }));
    await page.goto(path);
    await expect(page.locator(".page-enter").first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __animations: string[] }).__animations.includes("rise-in"))).toBe(true);
    // Ao terminar, nenhum bloco pode reter transform: isso deslocaria modais fixos.
    // Única exceção em laço (DESIGN.md, abertura): a flutuação do caneco e a respiração do halo.
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running" && animation.timeline === document.timeline && !animation.id.startsWith("opening-ambient-")).length)).toBe(0);
    const state = await page.evaluate(() => ({
      retained: Array.from(document.querySelectorAll(".page-enter > *")).filter((element) => getComputedStyle(element).transform !== "none" || getComputedStyle(element).opacity !== "1").length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(state.retained).toBe(0);
    expect(state.overflow).toBeLessThanOrEqual(0);
    expect(pageErrors).toEqual([]);
    if (process.env.MOTION_SHOTS) await page.screenshot({ path: `${process.env.MOTION_SHOTS}/${testInfo.project.name}${path.replaceAll("/", "_")}.png`, fullPage: true });
  });
}

test("abertura: só o caneco e o halo ficam em laço, e pausam fora da tela", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.goto("/abertura");
  const ambient = () => page.evaluate(() => document.getAnimations().filter((animation) => animation.id.startsWith("opening-ambient-")).map((animation) => `${animation.id}:${animation.playState}`).sort());
  await expect.poll(ambient).toEqual(["opening-ambient-float:running", "opening-ambient-halo:running"]);
  await page.evaluate(() => { document.querySelector<HTMLElement>(".opening-stage")!.style.display = "none"; });
  await expect.poll(ambient).toEqual(["opening-ambient-float:paused", "opening-ambient-halo:paused"]);
  await page.evaluate(() => { document.querySelector<HTMLElement>(".opening-stage")!.style.display = ""; });
  await expect.poll(ambient).toEqual(["opening-ambient-float:running", "opening-ambient-halo:running"]);
});

test("abertura com movimento reduzido não tem laço e mostra o palco inteiro", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockCoreApi(page, "jogador");
  await page.goto("/abertura");
  await expect(page.getByRole("heading", { name: "Bora fazer história e levar esse caneco para casa?" })).toBeVisible();
  await expect(page.locator(".opening-stage .opening-trophy-svg")).toBeVisible();
  // Com movimento reduzido as animações duram 0,01 ms: ainda aparecem como "running" por um
  // quadro logo depois de a tela montar. Um laço de verdade nunca chegaria a zero.
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  const hidden = await page.evaluate(() => Array.from(document.querySelectorAll(".opening-hero *")).filter((element) => getComputedStyle(element).opacity === "0" && !element.closest("svg")).length);
  expect(hidden).toBe(0);
});

test("movimento reduzido mostra o conteúdo sem deslocamento", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockCoreApi(page, "jogador");
  await page.goto("/inicio");
  const header = page.locator(".page-enter > *").first();
  await expect(header).toBeVisible();
  await expect(header).toHaveCSS("opacity", "1");
  await expect(header).toHaveCSS("transform", "none");
});

// ---------- Formato definitivo: zonas, desempate e mata-mata ----------

/** Classificação final fictícia: a Dupla N termina em Nº (grupo único com 7 duplas). */
function finalStandings(tied: string[] = []) {
  return teams.map((team, index) => ({
    position: index + 1, teamId: team.id, jogos: 6, vitorias: 6 - index, vitorias2x0: Math.max(0, 5 - index), derrotas: index,
    pontos: 18 - index * 3, saldoSets: 12 - index * 4, confrontoDireto: 0, tiePending: tied.includes(team.id),
  }));
}

/**
 * Mata-mata fictício já gerado, com os `played` primeiros jogos disputados (na ordem do
 * chaveamento: Quartas 1, Quartas 2, Semifinal 1, Semifinal 2, 3º lugar, Final). O lado A vence
 * por 2x0 em tudo, menos na final, que o lado B vence por 2x1. Como no sistema, um jogo só existe
 * quando as duas duplas são conhecidas; final e 3º lugar nascem juntos com as duas semifinais.
 *
 * Com a classificação de finalStandings: Q1 Dupla 3 × Dupla 6, Q2 Dupla 4 × Dupla 5,
 * S1 Dupla 1 × Dupla 4, S2 Dupla 2 × Dupla 3, 3º lugar Dupla 4 × Dupla 3 (vence a 4),
 * Final Dupla 1 × Dupla 2 (vence a 2).
 */
function knockoutFixture(played: number) {
  const plan = [
    { key: "Q1", round: "quartas", order: 0, label: "Quartas 1", a: "team-3", b: "team-6" },
    { key: "Q2", round: "quartas", order: 1, label: "Quartas 2", a: "team-4", b: "team-5" },
    { key: "S1", round: "semifinal", order: 0, label: "Semifinal 1", a: "team-1", b: "W:Q2" },
    { key: "S2", round: "semifinal", order: 1, label: "Semifinal 2", a: "team-2", b: "W:Q1" },
    { key: "T", round: "terceiro", order: 0, label: "Disputa de 3º lugar", a: "L:S1", b: "L:S2" },
    { key: "F", round: "final", order: 0, label: "Final", a: "W:S1", b: "W:S2" },
  ];
  const winners = new Map<string, string>();
  const losers = new Map<string, string>();
  const knockoutMatches: Array<Record<string, unknown>> = [];
  const slot = (source: string) => (source.startsWith("team-") ? { type: "direct", teamId: source } : { type: source.startsWith("W:") ? "winner" : "loser", bracketMatchId: "bracket-" + source.slice(2) });
  const resolve = (source: string) => (source.startsWith("team-") ? source : (source.startsWith("W:") ? winners : losers).get(source.slice(2)) ?? null);

  const bracket = plan.map((item, index) => {
    const teamAId = resolve(item.a);
    const teamBId = resolve(item.b);
    const ready = Boolean(teamAId && teamBId);
    if (ready) {
      const done = index < played;
      const result = done ? (item.key === "F" ? { setsA: 1, setsB: 2 } : { setsA: 2, setsB: 0 }) : null;
      if (result) {
        winners.set(item.key, result.setsA > result.setsB ? teamAId! : teamBId!);
        losers.set(item.key, result.setsA > result.setsB ? teamBId! : teamAId!);
      }
      knockoutMatches.push({
        id: "ko-" + item.key, championshipId: "edition-5", stage: "mata-mata", round: item.label, order: item.order, groupId: null,
        teamAId, teamBId, result, status: done ? "realizado" : "pendente", tableNumber: null, blockNumber: null, queuePosition: null,
      });
    }
    return { id: "bracket-" + item.key, round: item.round, label: item.label, order: item.order, slotA: slot(item.a), slotB: slot(item.b), matchId: ready ? "ko-" + item.key : null };
  });
  return { bracket, matches: knockoutMatches };
}

async function mockKnockout(page: Page, played: number, role: "admin" | "jogador" = "jogador") {
  await mockCoreApi(page, role);
  const fixture = knockoutFixture(played);
  // Campeão registrado assim que a final tem placar; edição encerrada só com final e 3º lugar.
  const champion = played >= 6 ? { teamId: "team-2", teamName: "Dupla 2" } : null;
  await page.route("**/api/bracket/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ editionFinished: played >= 6, champion, syncPending: false }) }));
  await page.route("**/api/groups/*/standings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(finalStandings()) }));
  await page.route("**/api/bracket", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture.bracket) }));
  await page.route("**/api/matches?stage=mata-mata", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture.matches) }));
}

/** Troca a dupla da sessão simulada (o padrão de mockCoreApi é a Dupla 1). */
async function asTeam(page: Page, teamId: string) {
  await page.addInitScript((id) => {
    const session = JSON.parse(localStorage.getItem("truco-do-novo:session")!);
    session.user.teamId = id;
    localStorage.setItem("truco-do-novo:session", JSON.stringify(session));
  }, teamId);
}

const resultButtons = (page: Page) => page.getByRole("button", { name: /Lançar resultado|Editar resultado/ });
const campaignPanel = (page: Page) => page.getByRole("region", { name: "Sua dupla no mata-mata" });

const cardSides = (page: Page, key: string) => page.locator(".ko-cell-" + key + " .ko-side-team strong");
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("Grupos pinta cada linha na cor da zona e a legenda explica as três", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.goto("/grupos");
  await expect(page.locator(".standings-row")).toHaveCount(7);
  // 1º e 2º semifinal, 3º a 6º quartas, 7º eliminado.
  for (const index of [0, 1]) await expect(page.locator(".standings-row").nth(index)).toHaveClass(/standings-row-semifinal/);
  for (const index of [2, 3, 4, 5]) await expect(page.locator(".standings-row").nth(index)).toHaveClass(/standings-row-quartas/);
  await expect(page.locator(".standings-row").nth(6)).toHaveClass(/standings-row-eliminado/);
  await expect(page.locator(".standings-row-repescagem")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Legenda da classificação" }).locator("li")).toHaveText([
    "Verde = Semifinal", "Azul = Quartas", "Vermelho = Eliminado", "Ordem da classificação: pontos, vitórias, vitórias por 2x0, confronto direto, saldo de quedas",
  ]);

  // As três zonas têm fundos diferentes entre si, e a linha da dupla mantém a cor da zona.
  const backgrounds = await page.locator(".standings-row").evaluateAll((rows) => rows.map((row) => getComputedStyle(row).backgroundColor));
  expect(new Set([backgrounds[0], backgrounds[2], backgrounds[6]]).size).toBe(3);
  expect(backgrounds[0]).toBe(backgrounds[1]);
  expect(backgrounds[2]).toBe(backgrounds[5]);
  await expect(page.locator(".standings-row-mine")).toHaveClass(/standings-row-semifinal/);
  await expect(page.locator(".standings-row-mine")).toContainText("Sua dupla");
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

test("empate exato aparece como pendente de decisão do administrador nos Grupos e no Mata-mata", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route("**/api/groups/*/standings", (route) => {
    const rows = finalStandings(["team-2", "team-3"]).map((row) => (["team-2", "team-3"].includes(row.teamId) ? { ...row, pontos: 14, vitorias: 5, vitorias2x0: 3, confrontoDireto: 0, saldoSets: 6 } : row));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });
  await page.goto("/grupos");
  await expect(page.locator(".standings-tie").filter({ visible: true })).toHaveCount(2);
  await expect(page.getByText(/dependem da decisão do administrador/)).toBeVisible();

  await page.goto("/mata-mata");
  await expect(page.getByText(/O chaveamento sai assim que o administrador decidir as posições/)).toBeVisible();
  await expect(page.locator(".ko-champion-decided")).toHaveCount(0);
});

test("Mata-mata mostra as posições antes do fim do grupo, sem prometer vaga", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.goto("/mata-mata");
  await expect(page.getByRole("heading", { name: "Mata-mata", level: 1 })).toBeVisible();
  await expect(page.locator(".ko-match")).toHaveCount(6);
  // Sem nenhum jogo disputado só aparecem as posições, nunca um nome.
  await expect(cardSides(page, "Q1")).toHaveText(["3º colocado", "6º colocado"]);
  await expect(cardSides(page, "Q2")).toHaveText(["4º colocado", "5º colocado"]);
  await expect(cardSides(page, "S1")).toHaveText(["1º colocado", "Vencedor das Quartas 2"]);
  await expect(cardSides(page, "S2")).toHaveText(["2º colocado", "Vencedor das Quartas 1"]);
  await expect(cardSides(page, "T")).toHaveText(["Perdedor da Semifinal 1", "Perdedor da Semifinal 2"]);
  await expect(cardSides(page, "F")).toHaveText(["Vencedor da Semifinal 1", "Vencedor da Semifinal 2"]);
  await expect(page.locator(".ko-champion-name")).toHaveText("A definir");
  await expect(page.locator(".knockout-step-current")).toHaveText("Fase de grupos");
  await expect(page.getByRole("region", { name: "Como cada posição do grupo entra" }).locator("li")).toHaveCount(3);
  // Pódio e premiação: 1º, 2º e 3º com o valor por dupla, ainda sem nomes.
  const podium = page.getByRole("region", { name: "Pódio e premiação" });
  await expect(podium.locator(".knockout-podium-title")).toHaveText(["Campeões · R$ 400 por dupla", "Vice-campeões · R$ 200 por dupla", "Terceiro lugar · R$ 100 por dupla"]);
  await expect(podium.locator(".knockout-podium-team")).toHaveText(["A definir", "A definir", "A definir"]);

  // Com a fase de grupos em andamento, mostra quem ocupa cada posição hoje — marcado como provisório.
  await page.route("**/api/groups/*/standings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(finalStandings().map((row) => ({ ...row, jogos: 2 }))) }));
  await page.reload();
  await expect(page.getByText(/Chaveamento provisório/)).toBeVisible();
  await expect(cardSides(page, "Q1")).toHaveText(["Dupla 3", "Dupla 6"]);
  await expect(page.locator(".ko-cell-Q1 .ko-side-team small").first()).toContainText("posição de hoje");
  // O 7º não aparece em lugar nenhum do chaveamento.
  await expect(page.locator(".ko").getByText("Dupla 7", { exact: true })).toHaveCount(0);
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

test("quartas cruzam 3º × 6º e 4º × 5º e os vencedores encontram 1º e 2º na semifinal", async ({ page }) => {
  await mockKnockout(page, 2);
  await page.goto("/mata-mata");
  await expect(cardSides(page, "Q1")).toHaveText(["Dupla 3", "Dupla 6"]);
  await expect(cardSides(page, "Q2")).toHaveText(["Dupla 4", "Dupla 5"]);
  await expect(page.locator(".ko-cell-Q1 .ko-side-winner")).toContainText("Dupla 3");
  await expect(page.locator(".ko-cell-Q1 .ko-side-sets")).toHaveText(["2", "0"]);
  // Semifinal 1: 1º × vencedor da Quartas 2 · Semifinal 2: 2º × vencedor da Quartas 1.
  await expect(cardSides(page, "S1")).toHaveText(["Dupla 1", "Dupla 4"]);
  await expect(cardSides(page, "S2")).toHaveText(["Dupla 2", "Dupla 3"]);
  // Final e 3º lugar esperam as duas semifinais.
  await expect(cardSides(page, "F")).toHaveText(["Vencedor da Semifinal 1", "Vencedor da Semifinal 2"]);
  await expect(cardSides(page, "T")).toHaveText(["Perdedor da Semifinal 1", "Perdedor da Semifinal 2"]);
  await expect(page.locator(".knockout-step-current")).toHaveText("Semifinal");
  await expect(page.locator(".ko-cell-S1 .ko-side-you")).toHaveText("Sua dupla");
});

test("semifinais geram a final e o 3º lugar; a final registra o campeão e o 3º lugar encerra a edição", async ({ page }) => {
  await mockKnockout(page, 4);
  await page.goto("/mata-mata");
  await expect(cardSides(page, "F")).toHaveText(["Dupla 1", "Dupla 2"]);
  await expect(cardSides(page, "T")).toHaveText(["Dupla 4", "Dupla 3"]);
  await expect(page.locator(".ko-cell-F .ko-match-status")).toHaveText("A jogar");
  await expect(page.locator(".ko-cell-T .ko-match-status")).toHaveText("A jogar");
  await expect(page.locator(".knockout-step-current")).toHaveText("Disputa de 3º lugar");
  await expect(page.getByText(/O campeonato termina quando as duas tiverem resultado/)).toBeVisible();
  await expect(page.locator(".ko-champion-decided")).toHaveCount(0);

  // 3º lugar decidido, final ainda não: há 3º colocado, mas nenhum campeão.
  await mockKnockout(page, 5);
  await page.reload();
  const podium = page.getByRole("region", { name: "Pódio e premiação" });
  await expect(podium.locator(".knockout-podium-team")).toHaveText(["A definir", "A definir", "Dupla 4"]);
  await expect(podium.locator(".knockout-podium-score")).toHaveText(["Disputa de 3º lugar · 2x0"]);
  await expect(page.locator(".ko-champion-decided")).toHaveCount(0);

  await mockKnockout(page, 6);
  await page.reload();
  await expect(page.locator(".ko-cell-F .ko-side-sets")).toHaveText(["1", "2"]);
  await expect(page.locator(".ko-cell-F .ko-side-winner")).toContainText("Dupla 2");
  await expect(page.locator(".ko-champion-decided .ko-champion-name")).toHaveText("Dupla 2");
  await expect(page.locator(".ko-champion-decided")).toContainText("Campeão da 5ª edição");
  await expect(page.locator(".ko-match-played")).toHaveCount(6);
  await expect(podium.locator(".knockout-podium-team")).toHaveText(["Dupla 2", "Dupla 1", "Dupla 4"]);
  await expect(podium.locator(".knockout-podium-item.is-decided")).toHaveCount(3);
  await expect(page.getByText("Campeonato encerrado.")).toBeVisible();
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

test("o chaveamento vira colunas ligadas no desktop e uma trilha única no celular", async ({ page }, testInfo) => {
  await mockKnockout(page, 6);
  await page.goto("/mata-mata");
  await expect(page.locator(".ko-match")).toHaveCount(6);
  // Mede só depois da entrada: durante a cascata as colunas ainda estão subindo.
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  const box = async (key: string) => (await page.locator(".ko-cell-" + key).boundingBox())!;
  const [q2, s1, q1, f, t] = [await box("Q2"), await box("S1"), await box("Q1"), await box("F"), await box("T")];
  if (testInfo.project.name === "mobile-chromium") {
    // Uma coluna só: cada fase abaixo da anterior, as quartas na ordem 1, 2 e o 3º lugar no fim.
    expect(Math.abs(q1.x - s1.x)).toBeLessThan(2);
    expect(q1.y).toBeLessThan(q2.y);
    expect(s1.y).toBeGreaterThan(q2.y);
    expect(t.y).toBeGreaterThan(f.y);
  } else {
    // Colunas: Quartas 2 → Semifinal 1 na mesma linha, da esquerda para a direita; 3º lugar abaixo.
    expect(s1.x).toBeGreaterThan(q2.x + q2.width);
    expect(f.x).toBeGreaterThan(s1.x + s1.width);
    expect(Math.abs((q2.y + q2.height / 2) - (s1.y + s1.height / 2))).toBeLessThan(3);
    expect(t.y).toBeGreaterThan(q1.y + q1.height);
  }
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
  if (process.env.MOTION_SHOTS) {
    await page.screenshot({ path: process.env.MOTION_SHOTS + "/" + testInfo.project.name + "_mata-mata-final.png", fullPage: true });
    await page.goto("/grupos");
    await expect(page.locator(".standings-row")).toHaveCount(7);
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
    await page.screenshot({ path: process.env.MOTION_SHOTS + "/" + testInfo.project.name + "_grupos.png", fullPage: true });
  }
});

test("o menu do jogador leva ao Mata-mata", async ({ page }, testInfo) => {
  await mockCoreApi(page, "jogador");
  await page.goto("/inicio");
  if (testInfo.project.name === "mobile-chromium") await page.getByRole("button", { name: /Mais/ }).click();
  await page.getByRole("link", { name: "Mata-mata" }).first().click();
  await expect(page).toHaveURL(/\/mata-mata$/);
  await expect(page.locator(".ko-match")).toHaveCount(6);
});

test("admin decide um empate exato escolhendo a ordem final das duplas", async ({ page }) => {
  await mockCoreApi(page, "admin");
  let decided = false;
  const tiedRows = () => finalStandings(decided ? [] : ["team-2", "team-3"]).map((row) => (["team-2", "team-3"].includes(row.teamId) ? { ...row, pontos: 14, vitorias: 5, vitorias2x0: 3, confrontoDireto: 0, saldoSets: 6 } : row));
  await page.route("**/api/groups/*/standings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(tiedRows()) }));
  let sentOrder: string[] = [];
  await page.route("**/api/groups/A/tiebreak", (route) => {
    sentOrder = route.request().postDataJSON().orderedTeamIds;
    decided = true;
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(tiedRows()) });
  });

  await page.goto("/admin/grupos");
  const panel = page.getByRole("region", { name: "Decidir empate do Grupo Único" });
  await expect(panel).toContainText("14 pontos, 5 vitórias, 3 por 2x0");
  await expect(panel).toContainText("confronto direto empatado e o mesmo saldo de quedas");
  await expect(panel.locator("li strong")).toHaveText(["Dupla 2", "Dupla 3"]);
  await expect(panel.locator(".tie-decision-position")).toHaveText(["2º", "3º"]);

  await panel.getByRole("button", { name: "Subir Dupla 3" }).click();
  await expect(panel.locator("li strong")).toHaveText(["Dupla 3", "Dupla 2"]);
  await panel.getByRole("button", { name: "Confirmar posições do Grupo Único" }).click();
  await expect(page.getByText("Posições confirmadas. O empate do Grupo Único está decidido.")).toBeVisible();
  expect(sentOrder).toEqual(["team-3", "team-2"]);
  await expect(page.getByRole("region", { name: "Decidir empate do Grupo Único" })).toHaveCount(0);
});

test("com o grupo encerrado o jogador vê as quartas valendo, sem depender do administrador", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route("**/api/groups/*/standings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(finalStandings()) }));
  await page.goto("/mata-mata");
  await expect(page.getByText(/as quartas já estão valendo/)).toBeVisible();
  await expect(page.locator(".knockout-page")).not.toContainText(/administrador confirmar|aguardando confirmação|Gerar mata-mata/i);
  await expect(cardSides(page, "Q1")).toHaveText(["Dupla 3", "Dupla 6"]);
  await expect(page.locator(".ko-cell-Q1 .ko-side-team small").first()).toContainText("classificação final");
  await expect(page.locator(".ko-cell-Q1 .ko-match-status")).toHaveText("Aguardando");
  // Sem jogo criado não há o que lançar.
  await expect(resultButtons(page)).toHaveCount(0);
});

test("primeiro acesso obriga a criar senha própria antes de liberar o campeonato", async ({ page }) => {
  await mockLeagueWithAccounts(page, fictionalLeague);
  const firstAccessUser = { id: "auth-player-1", playerId: "player-1", name: "Jogador 1", email: "test@example.invalid", role: "jogador", teamId: "team-1", mustChangePassword: true, avatarUrl: null };
  await page.route("**/api/auth/login", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: firstAccessUser, token: tokenFor(firstAccessUser.id), refreshToken: "refresh:" + firstAccessUser.id }) }));
  const changes: Array<{ body: unknown; authorization: string | undefined }> = [];
  await page.route("**/api/auth/change-password", (route) => {
    changes.push({ body: route.request().postDataJSON(), authorization: route.request().headers().authorization });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { ...firstAccessUser, mustChangePassword: false } }) });
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Ver lista de nomes" }).click();
  await page.locator(".profile-card").filter({ has: page.locator(".profile-name", { hasText: /^Jogador 1$/ }) }).click();
  await page.getByLabel("Senha").fill("senha-temporaria");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/criar-senha$/);
  await expect(page.getByRole("heading", { name: "Crie sua senha" })).toBeVisible();

  // Enquanto a senha temporária não for trocada, nenhuma tela do campeonato abre — nem recarregando.
  await page.goto("/jogos");
  await expect(page).toHaveURL(/\/criar-senha$/);
  await page.goto("/grupos");
  await expect(page).toHaveURL(/\/criar-senha$/);

  await page.getByLabel("Nova senha", { exact: true }).fill("12345");
  await page.getByLabel("Confirmar nova senha").fill("12345");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByText("A senha deve ter pelo menos 6 caracteres.")).toBeVisible();

  await page.getByLabel("Nova senha", { exact: true }).fill("segura1");
  await page.getByLabel("Confirmar nova senha").fill("segura2");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByText("As senhas não coincidem.")).toBeVisible();
  expect(changes).toHaveLength(0);

  await page.getByLabel("Confirmar nova senha").fill("segura1");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByText("Senha criada com sucesso!")).toBeVisible();
  await expect(page).toHaveURL(/\/inicio$/);
  // A troca vai com o token da própria sessão e sem e-mail: o servidor decide de quem é a senha.
  expect(changes).toHaveLength(1);
  expect(changes[0].body).toEqual({ newPassword: "segura1" });
  expect(changes[0].authorization).toMatch(/^Bearer .+/);
  // Depois da troca o campeonato abre normalmente.
  await page.goto("/jogos");
  await expect(page).toHaveURL(/\/jogos$/);
});

test("nenhuma senha fica embutida no que o navegador recebe", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", async (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (response.url().includes("/src/") && /javascript|typescript/.test(type)) scripts.push(await response.text().catch(() => ""));
  });
  await mockCoreApi(page, "jogador");
  await page.goto("/inicio");
  await expect(page.getByRole("region", { name: "Resumo da sua dupla" })).toBeVisible();
  // As telas de entrada e de senha carregam sob demanda: o código delas é buscado direto.
  for (const module of ["/src/pages/LoginPage.tsx", "/src/pages/CreatePasswordPage.tsx", "/src/services/authService.ts", "/src/services/api.ts", "/src/lib/authSession.ts"]) {
    const response = await page.request.get(module);
    expect(response.ok(), module).toBe(true);
    scripts.push(await response.text());
  }
  const source = scripts.join("\n");
  expect(scripts.length).toBeGreaterThan(20);
  // Nem senha padrão, nem chave de serviço, nem atribuição de senha fixa no código do frontend.
  expect(source).not.toMatch(/TRUCO_DEFAULT_PASSWORD|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
  // Qualquer chave em formato JWT que chegue ao navegador tem de ser a pública, nunca a de serviço.
  const roles = [...source.matchAll(/eyJ[\w-]{10,}\.(eyJ[\w-]{10,})\./g)].map((match) => {
    try { return String(JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")).role ?? ""); } catch { return ""; }
  });
  expect(roles).not.toContain("service_role");
  expect(source).not.toMatch(/password\s*[:=]\s*["'][^"']{3,}["']/i);
});

test("as semifinais só nascem depois das quartas de que dependem", async ({ page }) => {
  // Só a Quartas 1 terminou: a Semifinal 2 existe; a Semifinal 1 ainda espera a Quartas 2.
  await mockKnockout(page, 1);
  await page.goto("/mata-mata");
  await expect(page.locator(".ko-cell-Q1 .ko-side-winner")).toContainText("Dupla 3");
  await expect(page.locator(".ko-cell-Q2 .ko-match-status")).toHaveText("A jogar");
  await expect(cardSides(page, "S2")).toHaveText(["Dupla 2", "Dupla 3"]);
  await expect(cardSides(page, "S1")).toHaveText(["Dupla 1", "Vencedor das Quartas 2"]);
  await expect(page.locator(".ko-cell-S1 .ko-match-status")).toHaveText("Aguardando");
  await expect(page.locator(".ko-match-rematch")).toHaveCount(0);
});

// ---------- Resultado direto no chaveamento ----------

test("integrante das quartas lança o resultado no chaveamento e vê o vencedor na hora", async ({ page }) => {
  await mockKnockout(page, 0);
  await asTeam(page, "team-3");
  const fixture = knockoutFixture(0);
  let saved = false;
  const posts: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/matches?stage=mata-mata", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(fixture.matches.map((match) => (saved && match.id === "ko-Q1" ? { ...match, result: { setsA: 2, setsB: 1 }, status: "realizado" } : match))),
  }));
  await page.route(/\/api\/matches\/[^/]+\/result$/, (route) => {
    posts.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
    saved = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...fixture.matches[0], result: route.request().postDataJSON(), status: "realizado" }) });
  });

  await page.goto("/mata-mata");
  const card = page.locator(".ko-cell-Q1");
  await expect(card.locator(".ko-match-status")).toHaveText("A jogar");
  // "Sua vez": o confronto e o adversário aparecem no topo, com o botão de lançar.
  await expect(campaignPanel(page)).toContainText("Sua vez");
  await expect(campaignPanel(page)).toContainText("Quartas 1 · contra Dupla 6");
  await expect(campaignPanel(page).getByRole("button", { name: "Lançar resultado" })).toBeVisible();
  // As outras quartas não são da dupla: só leitura.
  await expect(page.locator(".ko-cell-Q2").getByRole("button")).toHaveCount(0);

  await card.getByRole("button", { name: "Lançar resultado" }).click();
  await card.getByRole("button", { name: "2x1", exact: true }).click();
  await card.getByRole("button", { name: "Confirmar resultado" }).click();

  await expect(card.locator(".ko-side-sets")).toHaveText(["2", "1"]);
  expect(posts).toEqual([{ path: "/api/matches/ko-Q1/result", body: { setsA: 2, setsB: 1 } }]);
  await expect(card.locator(".ko-side-winner")).toContainText("Dupla 3");
  await expect(card.locator(".ko-match-status")).toHaveText("Encerrado");
  await expect(card.getByRole("button", { name: "Editar resultado" })).toBeVisible();
  // Toast e destaque dizem a mesma coisa; nada de "classificação do seu grupo".
  await expect(campaignPanel(page).getByRole("heading", { name: "Classificados para a semifinal!" })).toBeVisible();
  await expect(page.getByText(/classificação do seu grupo/)).toHaveCount(0);
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

test("quem não joga a partida vê o chaveamento sem nenhum botão de resultado", async ({ page }) => {
  // Dupla 1: líder do grupo, espera na semifinal.
  await mockKnockout(page, 1);
  await page.goto("/mata-mata");
  await expect(page.locator(".ko-cell-Q2 .ko-match-status")).toHaveText("A jogar");
  await expect(page.locator(".ko-cell-Q1 .ko-match-status")).toHaveText("Encerrado");
  await expect(resultButtons(page)).toHaveCount(0);
  await expect(page.locator(".ko-match-actions")).toHaveCount(0);
  await expect(campaignPanel(page)).toContainText("Vocês aguardam o vencedor das Quartas 2, na Semifinal 1.");
});

test("cadeado fechado deixa o chaveamento só para leitura, com aviso", async ({ page }) => {
  await mockKnockout(page, 1);
  await asTeam(page, "team-5");
  await mockResultsLock(page, true);
  await page.goto("/mata-mata");
  await expect(page.locator(".ko-cell-Q2 .ko-match-status")).toHaveText("A jogar");
  await expect(page.locator(".results-lock-notice")).toHaveText(LOCKED_MESSAGE);
  await expect(resultButtons(page)).toHaveCount(0);
  // O confronto da dupla continua destacado, só sem ação.
  await expect(campaignPanel(page)).toContainText("Quartas 2 · contra Dupla 4");
});

test("editar resultado no chaveamento pede confirmação e mostra a recusa da API", async ({ page }) => {
  await mockKnockout(page, 4);
  await asTeam(page, "team-3");
  const refusal = "Não é possível trocar o vencedor: a fase seguinte já foi disputada.";
  const posts: unknown[] = [];
  await page.route(/\/api\/matches\/[^/]+\/result$/, (route) => {
    posts.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: refusal }) });
  });
  await page.goto("/mata-mata");
  const card = page.locator(".ko-cell-Q1");
  await expect(card.locator(".ko-side-sets")).toHaveText(["2", "0"]);
  await card.getByRole("button", { name: "Editar resultado" }).click();
  await card.getByRole("button", { name: "1x2", exact: true }).click();
  await card.getByRole("button", { name: "Salvar correção" }).click();

  // Nada é enviado antes da confirmação, e o texto é o do mata-mata.
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Substituir o resultado já lançado?");
  await expect(dialog).toContainText("corrigido para 1x2");
  await expect(dialog).toContainText("Se o vencedor mudar, a vaga na fase seguinte muda junto");
  await expect(dialog).not.toContainText("grupo");
  expect(posts).toHaveLength(0);

  await dialog.getByRole("button", { name: "Salvar correção" }).click();
  await expect(page.getByText(refusal)).toBeVisible();
  expect(posts).toEqual([{ setsA: 1, setsB: 2 }]);
  await expect(dialog).toHaveCount(0);
  await expect(card.locator(".ko-side-sets")).toHaveText(["2", "0"]);
});

test("recusa 403 da API fecha o formulário e o chaveamento passa a mostrar o cadeado", async ({ page }) => {
  await mockKnockout(page, 0);
  await asTeam(page, "team-3");
  const lock = await mockResultsLock(page, false);
  await page.goto("/mata-mata");
  const card = page.locator(".ko-cell-Q1");
  await card.getByRole("button", { name: "Lançar resultado" }).click();
  // O administrador fecha o cadeado com a tela aberta.
  lock.locked = true;
  await card.getByRole("button", { name: "2x0", exact: true }).click();
  await card.getByRole("button", { name: "Confirmar resultado" }).click();
  await expect(page.locator(".results-lock-notice")).toHaveText(LOCKED_MESSAGE);
  expect(lock.rejected).toBe(1);
  await expect(page.locator(".score-form")).toHaveCount(0);
  await expect(resultButtons(page)).toHaveCount(0);
});

test("quem vence as quartas vê Classificados para a semifinal, e o destaque sobrevive ao reload", async ({ page }) => {
  // Quartas 2: Dupla 4 vence a Dupla 5 e pega a Dupla 1 na Semifinal 1.
  await mockKnockout(page, 2);
  await asTeam(page, "team-4");
  await page.goto("/mata-mata");
  const headline = campaignPanel(page).getByRole("heading", { name: "Classificados para a semifinal!" });
  await expect(headline).toBeVisible();
  await expect(campaignPanel(page)).toContainText("Quartas 2: Dupla 4 2 × 0 Dupla 5");
  await expect(campaignPanel(page)).toContainText("Semifinal 1 · contra Dupla 1");
  await expect(campaignPanel(page).getByRole("button", { name: "Lançar resultado" })).toBeVisible();
  await page.reload();
  await expect(headline).toBeVisible();
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

test("quem perde nas quartas vê o fim da campanha, sem festa", async ({ page }) => {
  await mockKnockout(page, 2);
  await asTeam(page, "team-6");
  await page.goto("/mata-mata");
  await expect(campaignPanel(page).getByRole("heading", { name: "Fim da campanha nesta edição" })).toBeVisible();
  await expect(campaignPanel(page)).not.toContainText(/Classificados|Sua vez/);
});

test("quem perde a semifinal vai para a disputa de 3º lugar, com o botão de lançar", async ({ page }) => {
  // Semifinal 2: Dupla 2 vence a Dupla 3, que joga o 3º lugar contra a Dupla 4.
  await mockKnockout(page, 4);
  await asTeam(page, "team-3");
  await page.goto("/mata-mata");
  await expect(campaignPanel(page).getByRole("heading", { name: "Vocês vão disputar o 3º lugar" })).toBeVisible();
  await expect(campaignPanel(page)).toContainText("Disputa de 3º lugar · contra Dupla 4");
  await expect(campaignPanel(page).getByRole("button", { name: "Lançar resultado" })).toBeVisible();
  await expect(page.locator(".ko-cell-F").getByRole("button")).toHaveCount(0);
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

test("edição encerrada mostra campeão, vice e 3º lugar, e nenhum botão de resultado para jogador", async ({ page }) => {
  await mockKnockout(page, 6);
  await asTeam(page, "team-2");
  await page.goto("/mata-mata");
  await expect(page.locator(".ko-champion-decided .ko-champion-name")).toHaveText("Dupla 2");
  await expect(campaignPanel(page).getByRole("heading", { name: "Campeões da 5ª edição!" })).toBeVisible();
  await expect(page.locator(".ko-match-played")).toHaveCount(6);
  await expect(resultButtons(page)).toHaveCount(0);
  await page.reload();
  await expect(campaignPanel(page).getByRole("heading", { name: "Campeões da 5ª edição!" })).toBeVisible();
  await expect(resultButtons(page)).toHaveCount(0);

  // O vice vê o vice-campeonato, também sem botão.
  await asTeam(page, "team-1");
  await page.reload();
  await expect(campaignPanel(page).getByRole("heading", { name: "Vice-campeões da 5ª edição!" })).toBeVisible();
  await expect(resultButtons(page)).toHaveCount(0);

  // O 3º colocado vê o pódio; quem perdeu o 3º lugar termina em 4º.
  await asTeam(page, "team-4");
  await page.reload();
  await expect(campaignPanel(page).getByRole("heading", { name: "3º lugar da 5ª edição!" })).toBeVisible();
  await asTeam(page, "team-3");
  await page.reload();
  await expect(campaignPanel(page).getByRole("heading", { name: "Fim da campanha nesta edição: 4º lugar" })).toBeVisible();
  await expect(resultButtons(page)).toHaveCount(0);
});

test("Jogos ganha a aba Mata-mata quando os confrontos existem", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await asTeam(page, "team-3");
  await page.goto("/jogos");
  await expect(page.getByRole("tab", { name: "Mata-mata" })).toHaveCount(0);

  // Quartas encerradas: as semifinais existem e a Dupla 3 joga a Semifinal 2.
  const fixture = knockoutFixture(2);
  await page.route("**/api/matches", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([...matches, ...fixture.matches]) }));
  await page.reload();
  await page.getByRole("tab", { name: "Mata-mata" }).click();
  await expect(page.locator(".match-card")).toHaveCount(4);
  await expect(page.locator(".match-card-round")).toHaveText(["Quartas 1", "Quartas 2", "Semifinal 1", "Semifinal 2"]);
  // Mata-mata não rende pontos de grupo.
  await expect(page.locator(".match-card-points")).toHaveCount(0);
  // Uma seção por fase, na ordem do chaveamento.
  await expect(page.locator(".match-group-title")).toContainText(["Quartas de final", "Semifinal"]);
  const mine = page.locator(".match-card").filter({ hasText: "Semifinal 2" });
  await expect(mine.getByRole("button", { name: "Lançar resultado" })).toBeVisible();
  await expect(page.locator(".match-card").filter({ hasText: "Semifinal 1" }).getByRole("button")).toHaveCount(0);

  // Editar um jogo de mata-mata em Jogos usa o mesmo fluxo, com o texto do mata-mata.
  const played = page.locator(".match-card").filter({ hasText: "Quartas 1" });
  await played.getByRole("button", { name: "Editar resultado" }).click();
  await played.getByRole("button", { name: "2x1", exact: true }).click();
  await played.getByRole("button", { name: "Salvar correção" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Se o vencedor mudar, a vaga na fase seguinte muda junto");
  await expect(page.getByRole("alertdialog")).not.toContainText("grupo");
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

// ---------- Cadeado global de resultados ----------

const LOCKED_MESSAGE = "O lançamento de resultados será liberado pelo administrador no início do campeonato.";

/** Cadeado simulado com estado: o que o administrador grava é o que as próximas leituras devolvem. */
async function mockResultsLock(page: Page, initiallyLocked: boolean) {
  const state = { locked: initiallyLocked, updates: [] as boolean[], rejected: 0 };
  await page.route("**/api/matches/lock", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locked: state.locked }) }));
  await page.route("**/api/admin/results-lock", (route) => {
    state.locked = route.request().postDataJSON().locked;
    state.updates.push(state.locked);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locked: state.locked }) });
  });
  // A API recusa placar de jogador com o cadeado fechado, como o backend real.
  await page.route(/\/api\/matches\/[^/]+\/result$/, (route) => {
    if (!state.locked) return route.fallback();
    state.rejected += 1;
    return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: LOCKED_MESSAGE, code: "results_locked" }) });
  });
  return state;
}

test("com o cadeado fechado o jogador vê tudo, mas não lança nem edita resultado", async ({ page }) => {
  // resultSaved = true: o jogo 1 da dupla já tem placar, então haveria "Editar resultado".
  await mockCoreApi(page, "jogador", true);
  await mockResultsLock(page, true);
  await page.route("**/rest/v1/truco_history**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ANIMATED_HISTORY) }));
  await page.route("**/rest/v1/truco_championships**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ edition: 5, year: 2026 }]) }));
  await page.goto("/jogos");
  await expect(page.locator(".round-match")).toHaveCount(6);
  await expect(page.locator(".results-lock-notice")).toHaveText(LOCKED_MESSAGE);
  await expect(page.getByRole("button", { name: /Lançar resultado|Editar resultado/ })).toHaveCount(0);
  // O placar já lançado continua visível.
  await expect(page.locator(".round-match.is-done")).toHaveCount(1);

  // As outras telas abrem normalmente.
  for (const [path, heading] of [["/inicio", /Olá, Jogador 1/], ["/minha-dupla", "Minha Dupla"], ["/grupos", "Grupos"], ["/mata-mata", "Mata-mata"], ["/hall-da-fama", "Hall da Fama"], ["/maiores-campeoes", "Maiores Campeões"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }

  // Atualizar a página mantém o bloqueio.
  await page.goto("/jogos");
  await page.reload();
  await expect(page.locator(".results-lock-notice")).toBeVisible();
  await expect(page.getByRole("button", { name: /Lançar resultado|Editar resultado/ })).toHaveCount(0);
});

test("admin abre e fecha o cadeado com confirmação, e o estado sobrevive ao refresh", async ({ page }) => {
  await mockCoreApi(page, "admin");
  const lock = await mockResultsLock(page, true);
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ totalPlayers: 20, totalTeams: 10, pendingApprovals: 0, approvedTeams: 10, drawStatus: "realizado", matchesPlayed: 0, matchesPending: 20, currentPhase: "Fase de Grupos", nextMatches: [], champion: null }) }));
  await page.goto("/admin");
  const control = page.getByRole("region", { name: "Lançamento de resultados" });
  await expect(control.locator(".results-lock-state")).toHaveText("Bloqueado");

  // Liberar pede confirmação; cancelar não muda nada.
  await control.getByRole("button", { name: "Liberar resultados" }).click();
  await expect(page.getByRole("heading", { name: "Liberar lançamento de resultados para todos os jogadores?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(control.locator(".results-lock-state")).toHaveText("Bloqueado");
  expect(lock.updates).toEqual([]);

  await control.getByRole("button", { name: "Liberar resultados" }).click();
  await page.getByRole("button", { name: "Liberar", exact: true }).click();
  await expect(page.getByText("Resultados liberados. Os jogadores já podem lançar placar.")).toBeVisible();
  await expect(control.locator(".results-lock-state")).toHaveText("Liberado");
  expect(lock.updates).toEqual([false]);

  await page.reload();
  await expect(page.getByRole("region", { name: "Lançamento de resultados" }).locator(".results-lock-state")).toHaveText("Liberado");

  // Bloquear de novo também pede confirmação.
  await page.getByRole("region", { name: "Lançamento de resultados" }).getByRole("button", { name: "Bloquear resultados" }).click();
  await expect(page.getByRole("heading", { name: "Bloquear o lançamento de resultados?" })).toBeVisible();
  await page.getByRole("button", { name: "Bloquear", exact: true }).click();
  await expect(page.getByText("Resultados bloqueados. Os jogadores não podem mais lançar placar.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Lançamento de resultados" }).locator(".results-lock-state")).toHaveText("Bloqueado");
  expect(lock.updates).toEqual([false, true]);
});

test("depois de liberado o jogador lança resultado; bloqueado de novo, a API recusa e a tela acompanha", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  const lock = await mockResultsLock(page, false);
  await page.goto("/jogos");
  await expect(page.locator(".results-lock-notice")).toHaveCount(0);

  // Liberado: o lançamento funciona.
  await page.getByRole("button", { name: "Lançar resultado" }).first().click();
  await page.getByRole("button", { name: "2x0" }).click();
  await page.getByRole("button", { name: "Confirmar resultado" }).click();
  await expect(page.getByText(/Resultado registrado!/)).toBeVisible();
  expect(lock.rejected).toBe(0);

  // O administrador fecha o cadeado enquanto a tela do jogador continua aberta, ainda
  // mostrando os botões. A tentativa vai para a API, que recusa; a tela então se corrige.
  lock.locked = true;
  await page.getByRole("button", { name: "Lançar resultado" }).first().click();
  await page.getByRole("button", { name: "2x1" }).click();
  await page.getByRole("button", { name: "Confirmar resultado" }).click();
  await expect(page.locator(".toast, [role='alert'], [role='status']").filter({ hasText: LOCKED_MESSAGE }).first()).toBeVisible();
  expect(lock.rejected).toBe(1);
  await expect(page.locator(".results-lock-notice")).toBeVisible();
  await expect(page.getByRole("button", { name: /Lançar resultado|Editar resultado/ })).toHaveCount(0);

  // Refresh: continua bloqueado.
  await page.reload();
  await expect(page.locator(".results-lock-notice")).toBeVisible();
  await expect(page.getByRole("button", { name: /Lançar resultado|Editar resultado/ })).toHaveCount(0);
});

test("sem resposta sobre o cadeado a tela do jogador fica bloqueada, nunca liberada", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route("**/api/matches/lock", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "falha" }) }));
  await page.goto("/jogos");
  await expect(page.locator(".round-match")).toHaveCount(6);
  await expect(page.locator(".results-lock-notice")).toBeVisible();
  await expect(page.getByRole("button", { name: /Lançar resultado|Editar resultado/ })).toHaveCount(0);
});

test("placar salvo com avanço pendente fecha o formulário, recarrega o placar e não pede reenvio", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await mockResultsLock(page, false);
  let saved = false;
  let posts = 0;
  await page.route((url) => url.pathname === "/api/matches", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(matches.map((match, index) => index === 0 && saved ? { ...match, result: { setsA: 2, setsB: 0 }, status: "realizado" } : match)) }));
  await page.route(/\/api\/matches\/[^/]+\/result$/, (route) => {
    saved = true;
    posts += 1;
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "progression_pending", resultSaved: true, retryable: true, message: "O placar foi gravado. O avanço está pendente. Não reenvie o resultado." }) });
  });
  await page.goto("/jogos");
  // Dupla 1 × Dupla 2 é o jogo que a API simulada passa a devolver com placar.
  const savedCard = page.locator(".round-match").filter({ has: page.locator(".round-team-name", { hasText: /^Dupla 2$/ }) });
  await savedCard.getByRole("button", { name: "Lançar resultado" }).click();
  await savedCard.getByRole("button", { name: "2x0" }).click();
  await savedCard.getByRole("button", { name: "Confirmar resultado" }).click();
  await expect(page.getByText(/O placar foi gravado/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar resultado" })).toHaveCount(0);
  await expect(savedCard.locator(".round-team-sets")).toHaveText(["2", "0"]);
  expect(posts).toBe(1);
  await page.reload();
  expect(posts).toBe(1);
});

test("final salva com campeão pendente mantém placar e não anuncia campeonato encerrado", async ({ page }) => {
  await mockKnockout(page, 7);
  const fixture = knockoutFixture(7);
  const final = fixture.matches.find((match) => match.id === "ko-F")!;
  await asTeam(page, String(final.teamBId));
  await page.route("**/api/bracket/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ editionFinished: false, syncPending: true }) }));
  await page.goto("/mata-mata");
  await expect(page.getByRole("heading", { name: "Final vencida. Registro do título pendente." })).toBeVisible();
  await expect(page.getByText("Final salva; título em confirmação")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campeões da 5ª edição!" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Lançar resultado|Editar resultado/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Final salva; título em confirmação")).toBeVisible();
});

// ---------- Senhas: troca pelo jogador e "Redefinir senha" do administrador ----------

test("admin acompanha quantos criaram a senha e redefine um acesso, sem ver senha nenhuma", async ({ page }) => {
  await mockCoreApi(page, "admin");
  const access = players.map((player, index) => ({ playerId: player.id, hasAccount: true, setupPending: index >= 9, setupCompletedAt: index >= 9 ? null : "2026-10-20T12:00:00Z" }));
  await page.route("**/api/players", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(players.map((player, index) => ({ ...player, teamId: teams[Math.floor(index / 2)].id }))) }));
  await page.route("**/api/admin/players/access", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(access) }));
  const resets: string[] = [];
  await page.route("**/api/admin/players/*/reset-access", (route) => {
    resets.push(new URL(route.request().url()).pathname);
    access[0].setupPending = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ playerId: "player-1", playerName: "Jogador 1", accountCreated: false }) });
  });
  await page.goto("/admin/jogadores");
  await expect(page.locator(".access-summary-count")).toHaveText("9 de 14");
  const row = (name: string) => page.getByRole("row", { name: new RegExp("^" + name + " ") });
  await expect(row("Jogador 1")).toContainText("Senha criada");
  await expect(row("Jogador 10")).toContainText("Aguardando criação de senha");
  await row("Jogador 1").getByRole("button", { name: "Redefinir acesso" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("A senha atual deixa de valer");
  expect(resets).toHaveLength(0);
  await page.getByRole("alertdialog").getByRole("button", { name: "Redefinir acesso" }).click();
  expect(resets).toEqual(["/api/admin/players/player-1/reset-access"]);
  await expect(page.locator(".access-summary-count")).toHaveText("8 de 14");
  await expect(row("Jogador 1")).toContainText("Aguardando criação de senha");
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

test("primeiro acesso: a carta de quem ainda não criou a senha leva a \"Crie sua senha\" e entra direto", async ({ page }) => {
  await mockLeagueWithAccounts(page, fictionalLeague);
  await page.route("**/api/players/roster", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(players.map(({ id, name }) => ({ id, name, needsSetup: id === "player-1" }))) }));
  const sent: unknown[] = [];
  await page.route("**/api/auth/first-access", (route) => {
    sent.push(route.request().postDataJSON());
    const user = { id: "auth-player-1", playerId: "player-1", name: "Jogador 1", email: "x", role: "jogador", teamId: "team-1", mustChangePassword: false, avatarUrl: null };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user, token: tokenFor(user.id), refreshToken: "refresh:" + user.id }) });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Ver lista de nomes" }).click();
  await page.locator(".profile-card").filter({ has: page.locator(".profile-name", { hasText: /^Jogador 1$/ }) }).click();
  await expect(page.getByRole("heading", { name: "Crie sua senha para a 5ª Edição" })).toBeVisible();
  const form = page.getByRole("form", { name: "Crie sua senha" });
  await form.getByLabel("Nova senha").fill("minha-senha");
  await form.getByLabel("Repita a senha").fill("minha-senhx");
  await expect(form.getByRole("button", { name: "Criar senha e entrar" })).toBeDisabled();
  await form.getByLabel("Repita a senha").fill("minha-senha");
  await form.getByRole("button", { name: "Criar senha e entrar" }).click();
  await expect(page).toHaveURL(/\/(abertura|inicio)$/);
  expect(sent).toEqual([{ playerId: "player-1", newPassword: "minha-senha" }]);
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

test("primeiro acesso: se outra pessoa já criou a senha da carta, a tela avisa e pede a senha", async ({ page }) => {
  await mockLeagueWithAccounts(page, fictionalLeague);
  await page.route("**/api/players/roster", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(players.map(({ id, name }) => ({ id, name, needsSetup: id === "player-1" }))) }));
  await page.route("**/api/auth/first-access", (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "Este jogador já criou a senha. Entre com ela. Se não foi você, avise o administrador.", code: "already_configured" }) }));
  await page.goto("/login");
  await page.getByRole("button", { name: "Ver lista de nomes" }).click();
  await page.locator(".profile-card").filter({ has: page.locator(".profile-name", { hasText: /^Jogador 1$/ }) }).click();
  const form = page.getByRole("form", { name: "Crie sua senha" });
  await form.getByLabel("Nova senha").fill("minha-senha");
  await form.getByLabel("Repita a senha").fill("minha-senha");
  await form.getByRole("button", { name: "Criar senha e entrar" }).click();
  await expect(page.locator(".login-error")).toContainText("Se não foi você, avise o administrador.");
  await expect(page.getByLabel("Senha")).toBeVisible();
});

test("jogador altera a própria senha no Perfil informando a atual, e vê a recusa quando erra", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  const bodies: unknown[] = [];
  await page.route("**/api/auth/change-password", (route) => {
    const body = route.request().postDataJSON() as { currentPassword?: string };
    bodies.push(body);
    return body.currentPassword === "atual-certa"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "auth-user", playerId: "player-1", name: "Jogador 1", email: "x", role: "jogador", teamId: "team-1", mustChangePassword: false, avatarUrl: null } }) })
      : route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "A senha atual não confere." }) });
  });
  await page.goto("/perfil");
  const form = page.getByRole("form", { name: "Alterar senha" });
  const save = form.getByRole("button", { name: "Salvar nova senha" });
  await form.getByLabel("Senha atual").fill("chute");
  await form.getByLabel("Nova senha", { exact: true }).fill("minha-nova");
  await form.getByLabel("Repita a nova senha").fill("minha-outra");
  await expect(form.getByText("As duas senhas novas não são iguais.")).toBeVisible();
  await expect(save).toBeDisabled();
  await form.getByLabel("Repita a nova senha").fill("minha-nova");
  await save.click();
  await expect(form.getByText("A senha atual não confere.")).toBeVisible();
  await form.getByLabel("Senha atual").fill("atual-certa");
  await save.click();
  await expect(form.getByText("Senha alterada. Use a nova senha no próximo login.")).toBeVisible();
  await expect(form.getByLabel("Senha atual")).toHaveValue("");
  expect(bodies).toEqual([{ newPassword: "minha-nova", currentPassword: "chute" }, { newPassword: "minha-nova", currentPassword: "atual-certa" }]);
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});
