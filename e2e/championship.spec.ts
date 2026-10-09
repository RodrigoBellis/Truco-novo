import { expect, test, type Page } from "@playwright/test";
import { snapshotGroups, snapshotMatches, snapshotPlayers, snapshotStandings, snapshotTeams } from "./fixtures/edition5Snapshot";

// Dados fictícios só para os testes, no formato definitivo da edição: 10 duplas, 5 por grupo.
const players = Array.from({ length: 20 }, (_, index) => ({
  id: `player-${index + 1}`,
  name: `Jogador ${index + 1}`,
  role: "jogador",
  teamId: null,
  avatarUrl: index < 2 ? `/avatars/player-${index + 1}.webp` : null,
}));

const teams = Array.from({ length: 10 }, (_, index) => ({
  id: `team-${index + 1}`,
  name: `Dupla ${index + 1}`,
  player1Id: players[index * 2].id,
  player2Id: players[index * 2 + 1].id,
  status: "aprovada",
  seeded: false,
  isPlaceholder: false,
  groupId: index < 5 ? "A" : "B",
  strength: index % 5 + 1,
}));

const groups = [
  { id: "A", name: "Grupo A", teamIds: teams.slice(0, 5).map((team) => team.id) },
  { id: "B", name: "Grupo B", teamIds: teams.slice(5).map((team) => team.id) },
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

const groupPairs = Array.from({ length: 5 }, (_, first) => Array.from({ length: 5 - first - 1 }, (_, offset) => [first, first + offset + 1] as const)).flat();
const matches = Array.from({ length: 20 }, (_, index) => {
  const groupOffset = index < 10 ? 0 : 5;
  const [first, second] = groupPairs[index % 10];
  return ({
  id: `match-${index + 1}`,
  championshipId: "edition-5",
  stage: "grupos",
  round: index < 10 ? "Grupo A" : "Grupo B",
  order: index < 10 ? index : index - 10,
  groupId: index < 10 ? "A" : "B",
  teamAId: teams[groupOffset + first].id,
  teamBId: teams[groupOffset + second].id,
  result: null,
  status: "pendente",
  tableNumber: null,
  blockNumber: null,
  queuePosition: null,
  });
});

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
    else if (url.pathname.endsWith("/teams")) payload = smallTeamList ? teams.slice(0, 8) : teams;
    else if (url.pathname.endsWith("/players")) payload = players;
    else if (url.pathname.endsWith("/groups")) payload = groups;
    else if (url.pathname.includes("/standings")) payload = standings(url.pathname.endsWith("/A/standings") ? teams.slice(0, 5) : teams.slice(5));
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
    else if (url.pathname.endsWith("/groups/generate-matches")) payload = { matchesCreated: 20 };
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
  await page.getByRole("combobox", { name: "Jogador 1", exact: true }).selectOption("player-19");
  await page.getByRole("combobox", { name: "Jogador 2", exact: true }).selectOption("player-20");
  await page.getByLabel("Grupo").selectOption("B");
  await page.getByLabel("Força da dupla").selectOption("5");
  await expect(page.getByText("Dupla de teste").first()).toBeVisible();
  await page.getByRole("button", { name: "Salvar dupla" }).click();
  await expect(page.getByText("Participação atualizada.").or(page.getByText("Dupla criada para esta edição."))).toBeVisible();
});

test("admin confere as cinco posições e solicita os vinte jogos", async ({ page }) => {
  await mockCoreApi(page, "admin", false, false, true);
  await page.goto("/admin/grupos");
  await expect(page.getByText("Semifinal", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Quartas", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Repescagem", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Eliminado", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("5º", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("6º", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Gerar 20 jogos da fase de grupos" }).click();
  await expect(page.getByText("20 jogos criados com os grupos definidos pelo administrador.")).toBeVisible();
});

test("admin gera só os jogos que faltam quando duas duplas entram depois", async ({ page }) => {
  await mockCoreApi(page, "admin");
  // Jogos já gerados com 4 duplas por grupo: faltam os das duplas 5 (Grupo A) e 10 (Grupo B).
  const newcomers = ["team-5", "team-10"];
  await page.route("**/api/matches**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(matches.filter((match) => !newcomers.includes(match.teamAId) && !newcomers.includes(match.teamBId))) }));
  let completeCalls = 0;
  await page.route("**/api/groups/complete-matches", (route) => {
    completeCalls += 1;
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ matchesCreated: 8 }) });
  });
  await page.goto("/admin/grupos");
  await expect(page.getByRole("button", { name: /Gerar 20 jogos/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Gerar 8 jogos das duplas novas" }).click();
  await expect(page.getByText("8 jogos criados para as duplas novas. Placar e ordem dos jogos já disputados não mudaram.")).toBeVisible();
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

test("Grupos abre no grupo da dupla e permite consultar o outro grupo", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.goto("/grupos");
  await expect(page.getByRole("tab", { name: "Grupo A · Seu grupo" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Dupla 1").first()).toBeVisible();
  await expect(page.getByText("Sua dupla")).toBeVisible();
  await page.getByRole("tab", { name: "Grupo B", exact: true }).click();
  await expect(page.getByText("Dupla 7").first()).toBeVisible();
  await expect(page.getByText("Grupo B", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Sua dupla", { exact: true })).toHaveCount(0);
  await expect(page.locator(".standings-row-mine")).toHaveCount(0);
  await expect(page.getByText("Sua dupla está no Grupo A", { exact: true })).toBeVisible();
});

test("Jogos filtra pela dupla, grupo, situação e mostra placar na partida", async ({ page }) => {
  await mockCoreApi(page, "jogador", true);
  await page.goto("/jogos");
  await expect(page.getByRole("tab", { name: "Meus Jogos" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".match-card")).toHaveCount(4);
  await expect(page.locator(".match-group-title").filter({ hasText: "Grupo B" })).toHaveCount(0);
  const myTeamBanner = page.getByRole("region", { name: "Sua dupla e seu grupo" });
  await expect(myTeamBanner).toContainText("Dupla 1");
  await expect(myTeamBanner).toContainText("Está no Grupo A");
  await expect(page.locator(".match-card-outcome-win")).toHaveCount(1);
  await expect(page.locator(".match-card-outcome-win")).toContainText("Vitória");
  await expect(page.locator(".match-card-outcome-pending")).toHaveCount(3);
  await expect(page.locator(".match-group-title")).toHaveText(["Próximos confrontos3", "Já jogados1"]);
  await expect(myTeamBanner).toContainText("Próximo jogo");

  await page.getByRole("tab", { name: "Grupo A" }).click();
  await expect(page.locator(".match-card")).toHaveCount(10);

  await page.getByRole("tab", { name: "Grupo B" }).click();
  await expect(page.locator(".match-card")).toHaveCount(10);
  await expect(page.getByText("Dupla 7").first()).toBeVisible();
  await expect(page.locator(".match-card-mine")).toHaveCount(0);
  await expect(myTeamBanner).toContainText("Está no Grupo A");
  await page.getByRole("tab", { name: "Todos", exact: true }).click();
  await expect(page.locator(".match-card")).toHaveCount(20);

  await page.getByLabel("Filtrar por situação").selectOption("finished");
  await expect(page.locator(".match-card")).toHaveCount(1);
  await expect(page.locator(".match-card-team-result > strong")).toHaveText(["2", "0"]);
  await expect(page.locator(".match-card-team-winner")).toContainText("Dupla 1");
  await expect(page.locator(".match-card-points").first()).toHaveText("+3 pts");
  await expect(page.locator(".match-card-points").last()).toHaveText("+0 pts");
  await page.getByLabel("Filtrar por situação").selectOption("upcoming");
  await expect(page.locator(".match-card")).toHaveCount(19);
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
  standings: Record<"A" | "B", StandingFixture[]>;
  matches: Array<{ teamAId: string; teamBId: string; status: string }>;
}

const fixtureRow = (position: number, teamId: string, jogos: number, vitorias: number, derrotas: number, pontos: number, saldoSets: number): StandingFixture =>
  ({ position, teamId, jogos, vitorias, vitorias2x0: 0, derrotas, pontos, saldoSets, confrontoDireto: 0, tiePending: false });
const leagueStandings: Record<"A" | "B", StandingFixture[]> = {
  A: [fixtureRow(1, "team-3", 4, 4, 0, 10, 5), fixtureRow(2, "team-1", 4, 3, 1, 8, 2), fixtureRow(3, "team-2", 4, 2, 2, 6, 1), fixtureRow(4, "team-5", 4, 1, 3, 3, -2), fixtureRow(5, "team-4", 4, 0, 4, 1, -6)],
  B: [fixtureRow(1, "team-7", 3, 3, 0, 9, 4), fixtureRow(2, "team-8", 3, 2, 1, 6, 1), fixtureRow(3, "team-10", 3, 2, 1, 4, 0), fixtureRow(4, "team-6", 3, 1, 2, 3, -1), fixtureRow(5, "team-9", 3, 0, 3, 0, -4)],
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
    else if (url.pathname.endsWith("/B/standings")) payload = league.standings.B;
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
  const groupId = team.groupId as "A" | "B";
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
  await expect(hero.locator(".home-hero-group")).toHaveText(`Grupo ${groupId}`);

  await openMenu(page, "Minha Dupla");
  await expect(page.locator(".team-profile-name")).toHaveText(teamName);
  await expect(page.locator(".team-profile-member strong")).toHaveText([team.player1Id, team.player2Id].map((id) => league.players.find((player) => player.id === id)!.name));
  await expect(page.locator(".team-profile-group-mark")).toHaveText(`Grupo ${groupId}`);
  await expect(page.locator(".team-profile-position")).toHaveText(`${row.position}º lugar`);
  // Os números contam até o valor (AnimatedCounter); toHaveText espera a contagem terminar.
  await expect(page.locator(".team-performance dd")).toHaveText([String(row.pontos), String(row.vitorias), String(row.derrotas), saldo]);

  await openMenu(page, "Grupos");
  await expect(page.locator(".standings-row-mine")).toHaveCount(1);
  await expect(page.locator(".standings-row-mine .standings-team-name")).toHaveText(teamName);
  await expect(page.locator(".standings-row-mine .standings-position")).toHaveText(`${row.position}º`);
  await expect(page.locator(".standings-row-mine .standings-points")).toHaveText(String(row.pontos));

  await openMenu(page, "Jogos");
  await expect(page.locator(".matches-hero-name")).toHaveText(teamName);
  await expect(page.locator(".matches-hero-group")).toContainText(`Grupo ${groupId}`);
  await expect(page.locator(".matches-hero-group")).toContainText(`${row.position}º lugar`);
  await expect(page.locator(".matches-hero-stat dd")).toHaveText([String(row.pontos), String(row.vitorias), String(row.derrotas), String(pending)]);
}

test("cada conta vê só a própria dupla ao trocar de usuário, sem vazar estado entre logins", async ({ page }) => {
  test.setTimeout(90_000);
  await mockLeagueWithAccounts(page, fictionalLeague);
  await page.goto("/login");

  const sequence: Array<[player: string, team: string]> = [
    ["Jogador 1", "Dupla 1"],
    ["Jogador 5", "Dupla 3"],
    ["Jogador 13", "Dupla 7"],
    ["Jogador 19", "Dupla 10"],
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

test("Bagriel & Diguinho e Vito & Luizão veem só os próprios números reais ao trocar de conta", async ({ page }) => {
  test.setTimeout(90_000);
  await mockLeagueWithAccounts(page, realSnapshotLeague);
  await page.goto("/login");

  await loginAs(page, "Bagriel");
  await expectOwnTeamEverywhere(page, realSnapshotLeague, "Bagriel & Diguinho");
  await openMenu(page, "Minha Dupla");
  await expect(page.locator(".team-performance dd")).toHaveText(["8", "3", "1", "+3"]);
  await logout(page);

  await loginAs(page, "Vito");
  await expectOwnTeamEverywhere(page, realSnapshotLeague, "Vito & Luizão");
  await openMenu(page, "Minha Dupla");
  // Vito & Luizão: 1 ponto (derrota por 1x2 para Bagriel & Diguinho), nunca os 8 da outra dupla.
  await expect(page.locator(".team-performance dd")).toHaveText(["1", "0", "1", "-1"]);
  await page.reload();
  await expectOwnTeamEverywhere(page, realSnapshotLeague, "Vito & Luizão");
  await logout(page);

  await loginAs(page, "Diguinho");
  await expectOwnTeamEverywhere(page, realSnapshotLeague, "Bagriel & Diguinho");
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
  // Dupla 1 joga os índices 0 a 3 (contra as Duplas 2 a 5); o índice 4 é Dupla 2 x Dupla 3.
  await routeTeamMatches(page, {
    0: { setsA: 2, setsB: 0, queuePosition: 1 },
    1: { setsA: 1, setsB: 2, queuePosition: 2 },
    2: { setsA: 2, setsB: 1, queuePosition: 3 },
    3: { setsA: 0, setsB: 2, queuePosition: 4 },
    4: { setsA: 2, setsB: 0, queuePosition: 9 },
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
  await expect(profile.locator(".team-profile-group-mark")).toHaveText("Grupo A");
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
  await expect(page.getByText(/A repescagem nasce sozinha quando todos os jogos de grupo terminarem/)).toBeVisible();
  await expect(page.locator(".ko-match")).toHaveCount(7);
  await expect(generateButton).toHaveCount(0);

  // Grupos encerrados e sem empate: nada a gerar, a tela só explica.
  await page.route("**/api/groups/*/standings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(finalStandings(route.request().url().includes("/A/") ? "A" : "B")) }));
  await page.reload();
  await expect(page.getByText(/A repescagem nasce sozinha a partir da classificação final: não é preciso gerar nada/)).toBeVisible();
  await expect(generateButton).toHaveCount(0);
  await expect(page.locator(".admin-bracket-tie")).toHaveCount(0);

  // Empate exato: a única pendência do administrador, com o caminho para decidir.
  await page.route("**/api/groups/*/standings", (route) => {
    const groupId = route.request().url().includes("/A/") ? "A" : "B";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(finalStandings(groupId, groupId === "A" ? ["team-2", "team-3"] : [])) });
  });
  await page.reload();
  await expect(page.getByText(/A repescagem nasce sozinha logo depois que você decidir as posições/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Decidir o empate em Grupos" })).toHaveAttribute("href", "/admin/grupos");
  await expect(generateButton).toHaveCount(0);

  // Chaveamento já criado: o administrador registra o que falta e corrige o que já saiu.
  await mockKnockout(page, 1, "admin");
  await page.reload();
  await expect(page.getByText(/As fases nascem sozinhas/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar resultado" })).toHaveCount(1);
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
  await expect(hero.locator(".home-hero-group")).toHaveText("Grupo A");
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
  await page.getByRole("tab", { name: "Grupo B" }).click();
  await expect(page.locator(".match-card")).toHaveCount(10);
  await expect(page.getByRole("button", { name: /Lançar resultado|Editar resultado/ })).toHaveCount(0);
  await expect(page.locator(".match-card .team-strength")).toHaveCount(20);
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

test("Início de uma dupla do Grupo B leva ao próprio grupo e mantém a dupla ao recarregar", async ({ page }) => {
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
  await expect(hero.locator(".home-hero-group")).toHaveText("Grupo B");

  // Recarregar mantém a mesma dupla, sem rastro de outra.
  await page.reload();
  await expect(hero.locator(".home-hero-name")).toHaveText("Dupla 7");
  await expect(hero.locator(".home-hero-member strong")).toHaveText(["Jogador 13", "Jogador 14"]);
  await expect(page.locator(".player-home")).not.toContainText("Dupla 1");

  await hero.getByRole("link", { name: "Ver meu grupo" }).click();
  await expect(page).toHaveURL(/\/grupos$/);
  await expect(page.getByRole("tab", { name: "Grupo B · Seu grupo" })).toHaveAttribute("aria-selected", "true");
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

test("Grupos reconhece uma dupla do Grupo B e permite trocar pelo teclado", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.addInitScript(() => {
    const session = JSON.parse(localStorage.getItem("truco-do-novo:session")!);
    session.user.teamId = "team-7";
    session.user.playerId = "player-13";
    localStorage.setItem("truco-do-novo:session", JSON.stringify(session));
  });
  await page.goto("/grupos");
  const ownTab = page.getByRole("tab", { name: "Grupo B · Seu grupo" });
  await expect(ownTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".standings-row-mine")).toContainText("Dupla 7");
  await ownTab.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Grupo A", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".standings-row-mine")).toHaveCount(0);
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
  await page.getByRole("tab", { name: "Todos", exact: true }).click();
  await expect(page.locator(".match-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Lançar resultado|Editar resultado/ })).toHaveCount(0);
  await expect(page.locator(".match-card-mine-label")).toHaveCount(0);
  await expect(page.locator(".team-strength-pending")).toHaveCount(2);
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

/** Classificação final fictícia: a dupla N do grupo termina em Nº (Dupla 1 a 5 no A, 6 a 10 no B). */
function finalStandings(groupId: "A" | "B", tied: string[] = []) {
  return teams.filter((team) => team.groupId === groupId).map((team, index) => ({
    position: index + 1, teamId: team.id, jogos: 4, vitorias: 4 - index, vitorias2x0: Math.max(0, 3 - index), derrotas: index,
    pontos: 12 - index * 3, saldoSets: 8 - index * 4, confrontoDireto: 0, tiePending: tied.includes(team.id),
  }));
}

type RepechageOutcome = "thirds" | "fourths" | "bothFromA";

/**
 * Mata-mata fictício já gerado, com os `played` primeiros jogos disputados (na ordem do
 * chaveamento). `repechage` diz quem vence a repescagem: os dois 3º colocados (padrão), os
 * dois 4º, ou as duas duplas do Grupo A. Depois dela o lado A vence por 2x0 em tudo, menos na
 * final, que o lado B vence por 2x1. As quartas seguem a regra do sistema: só existem com as
 * duas repescagens encerradas, e o cruzamento é trocado quando isso evita reencontro.
 */
function knockoutFixture(played: number, repechage: RepechageOutcome = "thirds") {
  // Com os dois 4º colocados vencendo, o cruzamento padrão daria 2º A × 4º A e 2º B × 4º B.
  const swapped = repechage === "fourths";
  const plan = [
    { key: "R1", round: "repescagem", order: 0, label: "Repescagem 1", a: "team-3", b: "team-9" },
    { key: "R2", round: "repescagem", order: 1, label: "Repescagem 2", a: "team-8", b: "team-4" },
    { key: "Q1", round: "quartas", order: 0, label: "Quartas 1", a: "team-2", b: swapped ? "R1" : "R2" },
    { key: "Q2", round: "quartas", order: 1, label: "Quartas 2", a: "team-7", b: swapped ? "R2" : "R1" },
    { key: "S1", round: "semifinal", order: 0, label: "Semifinal 1", a: "team-1", b: "Q2" },
    { key: "S2", round: "semifinal", order: 1, label: "Semifinal 2", a: "team-6", b: "Q1" },
    { key: "F", round: "final", order: 0, label: "Final", a: "S1", b: "S2" },
  ];
  const sideBWins = (key: string) => key === "F" || (key === "R1" && repechage === "fourths") || (key === "R2" && repechage !== "thirds");
  const winners = new Map<string, string>();
  const knockoutMatches: Array<Record<string, unknown>> = [];
  const slot = (source: string) => (source.startsWith("team-") ? { type: "direct", teamId: source } : { type: "winner", bracketMatchId: "bracket-" + source });
  const resolve = (source: string) => (source.startsWith("team-") ? source : winners.get(source) ?? null);

  const bracket = plan.map((item, index) => {
    const teamAId = resolve(item.a);
    const teamBId = resolve(item.b);
    const repechageDone = winners.has("R1") && winners.has("R2");
    const ready = Boolean(teamAId && teamBId) && (item.round !== "quartas" || repechageDone);
    if (ready) {
      const done = index < played;
      const result = done ? (sideBWins(item.key) ? { setsA: 1, setsB: 2 } : { setsA: 2, setsB: 0 }) : null;
      if (result) winners.set(item.key, result.setsA > result.setsB ? teamAId! : teamBId!);
      knockoutMatches.push({
        id: "ko-" + item.key, championshipId: "edition-5", stage: "mata-mata", round: item.label, order: item.order, groupId: null,
        teamAId, teamBId, result, status: done ? "realizado" : "pendente", tableNumber: null, blockNumber: null, queuePosition: null,
      });
    }
    return { id: "bracket-" + item.key, round: item.round, label: item.label, order: item.order, slotA: slot(item.a), slotB: slot(item.b), matchId: ready ? "ko-" + item.key : null };
  });
  return { bracket, matches: knockoutMatches };
}

async function mockKnockout(page: Page, played: number, role: "admin" | "jogador" = "jogador", repechage: RepechageOutcome = "thirds") {
  await mockCoreApi(page, role);
  const fixture = knockoutFixture(played, repechage);
  await page.route("**/api/bracket/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ editionFinished: played === 7, syncPending: false }) }));
  await page.route("**/api/groups/*/standings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(finalStandings(route.request().url().includes("/A/") ? "A" : "B")) }));
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

test("Grupos pinta cada linha na cor da zona e a legenda explica as quatro", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.goto("/grupos");
  await expect(page.locator(".standings-row")).toHaveCount(5);
  // 1º semifinal, 2º quartas, 3º e 4º repescagem, 5º eliminado.
  await expect(page.locator(".standings-row").nth(0)).toHaveClass(/standings-row-semifinal/);
  await expect(page.locator(".standings-row").nth(1)).toHaveClass(/standings-row-quartas/);
  await expect(page.locator(".standings-row").nth(2)).toHaveClass(/standings-row-repescagem/);
  await expect(page.locator(".standings-row").nth(3)).toHaveClass(/standings-row-repescagem/);
  await expect(page.locator(".standings-row").nth(4)).toHaveClass(/standings-row-eliminado/);
  await expect(page.getByRole("list", { name: "Legenda da classificação" }).locator("li")).toHaveText([
    "Verde = Semifinal", "Azul = Quartas", "Laranja = Repescagem", "Vermelho = Eliminado", "Ordem da classificação: pontos, vitórias, vitórias por 2x0, confronto direto, saldo de quedas",
  ]);

  // As quatro zonas têm fundos diferentes entre si, e a linha da dupla mantém a cor da zona.
  const backgrounds = await page.locator(".standings-row").evaluateAll((rows) => rows.map((row) => getComputedStyle(row).backgroundColor));
  expect(new Set([backgrounds[0], backgrounds[1], backgrounds[2], backgrounds[4]]).size).toBe(4);
  expect(backgrounds[2]).toBe(backgrounds[3]);
  await expect(page.locator(".standings-row-mine")).toHaveClass(/standings-row-semifinal/);
  await expect(page.locator(".standings-row-mine")).toContainText("Sua dupla");
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

test("empate exato aparece como pendente de decisão do administrador nos Grupos e no Mata-mata", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route("**/api/groups/*/standings", (route) => {
    const groupId = route.request().url().includes("/A/") ? "A" : "B";
    const rows = finalStandings(groupId, groupId === "A" ? ["team-2", "team-3"] : []).map((row) => (["team-2", "team-3"].includes(row.teamId) ? { ...row, pontos: 8, vitorias: 3, vitorias2x0: 1, confrontoDireto: 0, saldoSets: 2 } : row));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });
  await page.goto("/grupos");
  await expect(page.locator(".standings-tie").filter({ visible: true })).toHaveCount(2);
  await expect(page.getByText(/dependem da decisão do administrador/)).toBeVisible();

  await page.goto("/mata-mata");
  await expect(page.getByText(/O chaveamento sai assim que o administrador decidir as posições/)).toBeVisible();
  await expect(page.locator(".ko-champion-decided")).toHaveCount(0);
});

test("Mata-mata mostra as posições antes do fim dos grupos, sem prometer vaga", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.goto("/mata-mata");
  await expect(page.getByRole("heading", { name: "Mata-mata", level: 1 })).toBeVisible();
  await expect(page.locator(".ko-match")).toHaveCount(7);
  // Sem nenhum jogo disputado só aparecem as posições, nunca um nome.
  await expect(cardSides(page, "R1")).toHaveText(["3º do Grupo A", "4º do Grupo B"]);
  await expect(cardSides(page, "R2")).toHaveText(["3º do Grupo B", "4º do Grupo A"]);
  // Qual vencedor da repescagem cai em cada jogo só se decide depois das duas repescagens.
  await expect(cardSides(page, "Q1")).toHaveText(["2º do Grupo A", "Vencedor da repescagem"]);
  await expect(cardSides(page, "Q2")).toHaveText(["2º do Grupo B", "Vencedor da repescagem"]);
  await expect(cardSides(page, "S1")).toHaveText(["1º do Grupo A", "Vencedor das Quartas 2"]);
  await expect(cardSides(page, "S2")).toHaveText(["1º do Grupo B", "Vencedor das Quartas 1"]);
  await expect(cardSides(page, "F")).toHaveText(["Vencedor da Semifinal 1", "Vencedor da Semifinal 2"]);
  await expect(page.locator(".ko-champion-name")).toHaveText("A definir");
  await expect(page.locator(".knockout-step-current")).toHaveText("Fase de grupos");
  await expect(page.getByRole("region", { name: "Como cada posição do grupo entra" }).locator("li")).toHaveCount(4);

  // Com a fase de grupos em andamento, mostra quem ocupa cada posição hoje — marcado como provisório.
  await page.route("**/api/groups/*/standings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(finalStandings(route.request().url().includes("/A/") ? "A" : "B").map((row) => ({ ...row, jogos: 2 }))) }));
  await page.reload();
  await expect(page.getByText(/Chaveamento provisório/)).toBeVisible();
  await expect(cardSides(page, "R1")).toHaveText(["Dupla 3", "Dupla 9"]);
  await expect(page.locator(".ko-cell-R1 .ko-side-team small").first()).toContainText("posição de hoje");
  // O 5º de cada grupo não aparece em lugar nenhum do chaveamento.
  await expect(page.locator(".ko").getByText("Dupla 5", { exact: true })).toHaveCount(0);
  await expect(page.locator(".ko").getByText("Dupla 10", { exact: true })).toHaveCount(0);
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

test("repescagem cruza os grupos e os vencedores encontram os 2º colocados nas quartas", async ({ page }) => {
  await mockKnockout(page, 2);
  await page.goto("/mata-mata");
  await expect(cardSides(page, "R1")).toHaveText(["Dupla 3", "Dupla 9"]);
  await expect(cardSides(page, "R2")).toHaveText(["Dupla 8", "Dupla 4"]);
  await expect(page.locator(".ko-cell-R1 .ko-side-winner")).toContainText("Dupla 3");
  await expect(page.locator(".ko-cell-R1 .ko-side-sets")).toHaveText(["2", "0"]);
  // Quartas 1: 2º A × vencedor de B3×A4 · Quartas 2: 2º B × vencedor de A3×B4.
  await expect(cardSides(page, "Q1")).toHaveText(["Dupla 2", "Dupla 8"]);
  await expect(cardSides(page, "Q2")).toHaveText(["Dupla 7", "Dupla 3"]);
  // Os líderes já esperam na semifinal; o outro lado ainda depende das quartas.
  await expect(cardSides(page, "S1")).toHaveText(["Dupla 1", "Vencedor das Quartas 2"]);
  await expect(cardSides(page, "S2")).toHaveText(["Dupla 6", "Vencedor das Quartas 1"]);
  await expect(page.locator(".knockout-step-current")).toHaveText("Quartas de final");
  await expect(page.locator(".ko-cell-S1 .ko-side-you")).toHaveText("Sua dupla");
});

test("quartas levam à semifinal, a semifinal gera a final e a final define o campeão", async ({ page }) => {
  await mockKnockout(page, 6);
  await page.goto("/mata-mata");
  await expect(cardSides(page, "S1")).toHaveText(["Dupla 1", "Dupla 7"]);
  await expect(cardSides(page, "S2")).toHaveText(["Dupla 6", "Dupla 2"]);
  await expect(cardSides(page, "F")).toHaveText(["Dupla 1", "Dupla 6"]);
  await expect(page.locator(".ko-cell-F .ko-match-status")).toHaveText("A jogar");
  await expect(page.locator(".knockout-step-current")).toHaveText("Final");
  await expect(page.locator(".ko-champion-decided")).toHaveCount(0);

  await mockKnockout(page, 7);
  await page.reload();
  await expect(page.locator(".ko-cell-F .ko-side-sets")).toHaveText(["1", "2"]);
  await expect(page.locator(".ko-cell-F .ko-side-winner")).toContainText("Dupla 6");
  await expect(page.locator(".ko-champion-decided .ko-champion-name")).toHaveText("Dupla 6");
  await expect(page.locator(".ko-champion-decided")).toContainText("Campeão da 5ª edição");
  await expect(page.locator(".ko-match-played")).toHaveCount(7);
  await expect(page.getByText("Campeonato encerrado.")).toBeVisible();
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

test("o chaveamento vira colunas ligadas no desktop e uma trilha única no celular", async ({ page }, testInfo) => {
  await mockKnockout(page, 7);
  await page.goto("/mata-mata");
  await expect(page.locator(".ko-match")).toHaveCount(7);
  // Mede só depois da entrada: durante a cascata as colunas ainda estão subindo.
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  const box = async (key: string) => (await page.locator(".ko-cell-" + key).boundingBox())!;
  const [r1, q2, s1, q1] = [await box("R1"), await box("Q2"), await box("S1"), await box("Q1")];
  if (testInfo.project.name === "mobile-chromium") {
    // Uma coluna só: cada fase abaixo da anterior e as quartas na ordem 1, 2.
    expect(Math.abs(r1.x - q2.x)).toBeLessThan(2);
    expect(q1.y).toBeLessThan(q2.y);
    expect(s1.y).toBeGreaterThan(q2.y);
  } else {
    // Colunas: Repescagem 1 → Quartas 2 → Semifinal 1 na mesma linha, da esquerda para a direita.
    expect(q2.x).toBeGreaterThan(r1.x + r1.width);
    expect(s1.x).toBeGreaterThan(q2.x + q2.width);
    expect(Math.abs((r1.y + r1.height / 2) - (q2.y + q2.height / 2))).toBeLessThan(3);
    expect(Math.abs((q2.y + q2.height / 2) - (s1.y + s1.height / 2))).toBeLessThan(3);
  }
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
  if (process.env.MOTION_SHOTS) {
    await page.screenshot({ path: process.env.MOTION_SHOTS + "/" + testInfo.project.name + "_mata-mata-final.png", fullPage: true });
    await page.goto("/grupos");
    await expect(page.locator(".standings-row")).toHaveCount(5);
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
  await expect(page.locator(".ko-match")).toHaveCount(7);
});

test("admin decide um empate exato escolhendo a ordem final das duplas", async ({ page }) => {
  await mockCoreApi(page, "admin");
  let decided = false;
  const tiedRows = () => finalStandings("A", decided ? [] : ["team-2", "team-3"]).map((row) => (["team-2", "team-3"].includes(row.teamId) ? { ...row, pontos: 8, vitorias: 3, vitorias2x0: 1, confrontoDireto: 0, saldoSets: 2 } : row));
  await page.route("**/api/groups/*/standings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(route.request().url().includes("/A/") ? tiedRows() : finalStandings("B")) }));
  let sentOrder: string[] = [];
  await page.route("**/api/groups/A/tiebreak", (route) => {
    sentOrder = route.request().postDataJSON().orderedTeamIds;
    decided = true;
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(tiedRows()) });
  });

  await page.goto("/admin/grupos");
  const panel = page.getByRole("region", { name: "Decidir empate do Grupo A" });
  await expect(panel).toContainText("8 pontos, 3 vitórias, 1 por 2x0");
  await expect(panel).toContainText("confronto direto empatado e o mesmo saldo de quedas");
  await expect(panel.locator("li strong")).toHaveText(["Dupla 2", "Dupla 3"]);
  await expect(panel.locator(".tie-decision-position")).toHaveText(["2º", "3º"]);
  await expect(page.getByRole("region", { name: "Decidir empate do Grupo B" })).toHaveCount(0);

  await panel.getByRole("button", { name: "Subir Dupla 3" }).click();
  await expect(panel.locator("li strong")).toHaveText(["Dupla 3", "Dupla 2"]);
  await panel.getByRole("button", { name: "Confirmar posições do Grupo A" }).click();
  await expect(page.getByText("Posições confirmadas. O empate do Grupo A está decidido.")).toBeVisible();
  expect(sentOrder).toEqual(["team-3", "team-2"]);
  await expect(page.getByRole("region", { name: "Decidir empate do Grupo A" })).toHaveCount(0);
});

test("com os grupos encerrados o jogador vê a repescagem valendo, sem depender do administrador", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route("**/api/groups/*/standings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(finalStandings(route.request().url().includes("/A/") ? "A" : "B")) }));
  await page.goto("/mata-mata");
  await expect(page.getByText(/a repescagem já está valendo/)).toBeVisible();
  await expect(page.locator(".knockout-page")).not.toContainText(/administrador confirmar|aguardando confirmação|Gerar mata-mata/i);
  await expect(cardSides(page, "R1")).toHaveText(["Dupla 3", "Dupla 9"]);
  await expect(page.locator(".ko-cell-R1 .ko-side-team small").first()).toContainText("classificação final");
  await expect(page.locator(".ko-cell-R1 .ko-match-status")).toHaveText("Aguardando");
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

test("as quartas só são montadas depois das duas repescagens", async ({ page }) => {
  // Só a Repescagem 1 terminou: nenhum jogo das quartas existe ainda.
  await mockKnockout(page, 1);
  await page.goto("/mata-mata");
  await expect(page.locator(".ko-cell-R1 .ko-side-winner")).toContainText("Dupla 3");
  await expect(page.locator(".ko-cell-R2 .ko-match-status")).toHaveText("A jogar");
  await expect(cardSides(page, "Q1")).toHaveText(["Dupla 2", "Vencedor da repescagem"]);
  await expect(cardSides(page, "Q2")).toHaveText(["Dupla 7", "Vencedor da repescagem"]);
  await expect(page.locator(".ko-cell-Q1 .ko-match-status")).toHaveText("Aguardando");
  await expect(page.locator(".ko-cell-Q2 .ko-match-status")).toHaveText("Aguardando");
});

test("quartas trocam o cruzamento quando isso evita reencontro do mesmo grupo", async ({ page }) => {
  // Vencem os dois 4º colocados (Dupla 9, do B, e Dupla 4, do A). Pelo cruzamento fixo seria
  // Dupla 2 × Dupla 4 e Dupla 7 × Dupla 9 — dois reencontros de grupo.
  await mockKnockout(page, 2, "jogador", "fourths");
  await page.goto("/mata-mata");
  await expect(page.locator(".ko-cell-R1 .ko-side-winner")).toContainText("Dupla 9");
  await expect(page.locator(".ko-cell-R2 .ko-side-winner")).toContainText("Dupla 4");
  await expect(cardSides(page, "Q1")).toHaveText(["Dupla 2", "Dupla 9"]);
  await expect(cardSides(page, "Q2")).toHaveText(["Dupla 7", "Dupla 4"]);
  // A origem de cada vencedor aparece como ficou gravada.
  await expect(page.locator(".ko-cell-Q1 .ko-side-team small").nth(1)).toContainText("Vencedor da Repescagem 1");
  await expect(page.locator(".ko-cell-Q2 .ko-side-team small").nth(1)).toContainText("Vencedor da Repescagem 2");
  await expect(page.locator(".ko-match-rematch")).toHaveCount(0);
  await expect(page.getByText(/Reencontro inevitável/)).toHaveCount(0);
});

test("reencontro inevitável nas quartas é mostrado, não escondido", async ({ page }) => {
  // Os dois vencedores da repescagem são do Grupo A (Dupla 3 e Dupla 4): um deles enfrenta a
  // Dupla 2, 2ª do mesmo grupo, em qualquer cruzamento.
  await mockKnockout(page, 2, "jogador", "bothFromA");
  await page.goto("/mata-mata");
  await expect(cardSides(page, "Q1")).toHaveText(["Dupla 2", "Dupla 4"]);
  await expect(cardSides(page, "Q2")).toHaveText(["Dupla 7", "Dupla 3"]);
  await expect(page.locator(".ko-cell-Q1 .ko-match-rematch")).toHaveText("Reencontro do grupo");
  await expect(page.locator(".ko-cell-Q2 .ko-match-rematch")).toHaveCount(0);
  await expect(page.getByText(/Reencontro inevitável nas quartas: Dupla 2 e Dupla 4 já se enfrentaram na fase de grupos/)).toBeVisible();
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

// ---------- Resultado direto no chaveamento ----------

test("integrante da repescagem lança o resultado no chaveamento e vê o vencedor na hora", async ({ page }) => {
  await mockKnockout(page, 0);
  await asTeam(page, "team-3");
  const fixture = knockoutFixture(0);
  let saved = false;
  const posts: Array<{ path: string; body: unknown }> = [];
  await page.route("**/api/matches?stage=mata-mata", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(fixture.matches.map((match) => (saved && match.id === "ko-R1" ? { ...match, result: { setsA: 2, setsB: 1 }, status: "realizado" } : match))),
  }));
  await page.route(/\/api\/matches\/[^/]+\/result$/, (route) => {
    posts.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
    saved = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...fixture.matches[0], result: route.request().postDataJSON(), status: "realizado" }) });
  });

  await page.goto("/mata-mata");
  const card = page.locator(".ko-cell-R1");
  await expect(card.locator(".ko-match-status")).toHaveText("A jogar");
  // "Sua vez": o confronto e o adversário aparecem no topo, com o botão de lançar.
  await expect(campaignPanel(page)).toContainText("Sua vez");
  await expect(campaignPanel(page)).toContainText("Repescagem 1 · contra Dupla 9");
  await expect(campaignPanel(page).getByRole("button", { name: "Lançar resultado" })).toBeVisible();
  // A outra repescagem não é da dupla: só leitura.
  await expect(page.locator(".ko-cell-R2").getByRole("button")).toHaveCount(0);

  await card.getByRole("button", { name: "Lançar resultado" }).click();
  await card.getByRole("button", { name: "2x1", exact: true }).click();
  await card.getByRole("button", { name: "Confirmar resultado" }).click();

  await expect(card.locator(".ko-side-sets")).toHaveText(["2", "1"]);
  expect(posts).toEqual([{ path: "/api/matches/ko-R1/result", body: { setsA: 2, setsB: 1 } }]);
  await expect(card.locator(".ko-side-winner")).toContainText("Dupla 3");
  await expect(card.locator(".ko-match-status")).toHaveText("Encerrado");
  await expect(card.getByRole("button", { name: "Editar resultado" })).toBeVisible();
  // Toast e destaque dizem a mesma coisa; nada de "classificação do seu grupo".
  await expect(campaignPanel(page).getByRole("heading", { name: "Classificados para as quartas de final!" })).toBeVisible();
  await expect(page.getByText(/classificação do seu grupo/)).toHaveCount(0);
  await expect(campaignPanel(page)).toContainText("Vocês aguardam o fim da Repescagem 2");
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

test("quem não joga a partida vê o chaveamento sem nenhum botão de resultado", async ({ page }) => {
  // Dupla 1: líder do Grupo A, espera na semifinal.
  await mockKnockout(page, 1);
  await page.goto("/mata-mata");
  await expect(page.locator(".ko-cell-R2 .ko-match-status")).toHaveText("A jogar");
  await expect(page.locator(".ko-cell-R1 .ko-match-status")).toHaveText("Encerrado");
  await expect(resultButtons(page)).toHaveCount(0);
  await expect(page.locator(".ko-match-actions")).toHaveCount(0);
  await expect(campaignPanel(page)).toContainText("Vocês aguardam o vencedor das Quartas 2, na Semifinal 1.");
});

test("cadeado fechado deixa o chaveamento só para leitura, com aviso", async ({ page }) => {
  await mockKnockout(page, 1);
  await asTeam(page, "team-8");
  await mockResultsLock(page, true);
  await page.goto("/mata-mata");
  await expect(page.locator(".ko-cell-R2 .ko-match-status")).toHaveText("A jogar");
  await expect(page.locator(".results-lock-notice")).toHaveText(LOCKED_MESSAGE);
  await expect(resultButtons(page)).toHaveCount(0);
  // O confronto da dupla continua destacado, só sem ação.
  await expect(campaignPanel(page)).toContainText("Repescagem 2 · contra Dupla 4");
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
  const card = page.locator(".ko-cell-R1");
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
  const card = page.locator(".ko-cell-R1");
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
  // Quartas 2: Dupla 7 vence a Dupla 3 e pega a Dupla 1 na Semifinal 1.
  await mockKnockout(page, 4);
  await asTeam(page, "team-7");
  await page.goto("/mata-mata");
  const headline = campaignPanel(page).getByRole("heading", { name: "Classificados para a semifinal!" });
  await expect(headline).toBeVisible();
  await expect(campaignPanel(page)).toContainText("Quartas 2: Dupla 7 2 × 0 Dupla 3");
  await expect(campaignPanel(page)).toContainText("Semifinal 1 · contra Dupla 1");
  await expect(campaignPanel(page).getByRole("button", { name: "Lançar resultado" })).toBeVisible();
  await page.reload();
  await expect(headline).toBeVisible();
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});

test("quem perde no mata-mata vê o fim da campanha, sem festa", async ({ page }) => {
  await mockKnockout(page, 4);
  await asTeam(page, "team-3");
  await page.goto("/mata-mata");
  await expect(campaignPanel(page).getByRole("heading", { name: "Fim da campanha nesta edição" })).toBeVisible();
  await expect(campaignPanel(page)).not.toContainText(/Classificados|Sua vez/);
});

test("final encerrada mostra o campeão e nenhum botão de resultado para jogador", async ({ page }) => {
  await mockKnockout(page, 7);
  await asTeam(page, "team-6");
  await page.goto("/mata-mata");
  await expect(page.locator(".ko-champion-decided .ko-champion-name")).toHaveText("Dupla 6");
  await expect(campaignPanel(page).getByRole("heading", { name: "Campeões da 5ª edição!" })).toBeVisible();
  await expect(page.locator(".ko-match-played")).toHaveCount(7);
  await expect(resultButtons(page)).toHaveCount(0);
  await page.reload();
  await expect(campaignPanel(page).getByRole("heading", { name: "Campeões da 5ª edição!" })).toBeVisible();
  await expect(resultButtons(page)).toHaveCount(0);

  // O vice vê a despedida, também sem botão.
  await asTeam(page, "team-1");
  await page.reload();
  await expect(campaignPanel(page).getByRole("heading", { name: "Fim da campanha nesta edição" })).toBeVisible();
  await expect(resultButtons(page)).toHaveCount(0);
});

test("Jogos tem o filtro Mata-mata: vazio antes dos jogos existirem e com os confrontos depois", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await asTeam(page, "team-3");
  await page.goto("/jogos");
  const tab = page.getByRole("tab", { name: "Mata-mata" });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "O mata-mata ainda não começou" })).toBeVisible();
  await expect(page.locator(".match-card")).toHaveCount(0);

  // Repescagens encerradas: as quartas existem e a Dupla 3 joga as Quartas 2.
  const fixture = knockoutFixture(2);
  await page.route("**/api/matches", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([...matches, ...fixture.matches]) }));
  await page.reload();
  await page.getByRole("tab", { name: "Mata-mata" }).click();
  await expect(page.locator(".match-card")).toHaveCount(4);
  await expect(page.locator(".match-card-round")).toHaveText(["Repescagem 1", "Repescagem 2", "Quartas 1", "Quartas 2"]);
  // Mata-mata não rende pontos de grupo.
  await expect(page.locator(".match-card-points")).toHaveCount(0);
  // Uma seção por fase, na ordem do chaveamento.
  await expect(page.locator(".match-group-title")).toContainText(["Repescagem", "Quartas de final"]);
  const mine = page.locator(".match-card").filter({ hasText: "Quartas 2" });
  await expect(mine.getByRole("button", { name: "Lançar resultado" })).toBeVisible();
  await expect(page.locator(".match-card").filter({ hasText: "Quartas 1" }).getByRole("button")).toHaveCount(0);

  // Editar um jogo de mata-mata em Jogos usa o mesmo fluxo, com o texto do mata-mata.
  const played = page.locator(".match-card").filter({ hasText: "Repescagem 1" });
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
  await expect(page.locator(".match-card")).toHaveCount(4);
  await expect(page.locator(".results-lock-notice")).toHaveText(LOCKED_MESSAGE);
  await expect(page.getByRole("button", { name: /Lançar resultado|Editar resultado/ })).toHaveCount(0);
  // O placar já lançado continua visível.
  await expect(page.locator(".match-card-outcome-win")).toHaveCount(1);

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
  await expect(page.locator(".match-card")).toHaveCount(4);
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
  await page.getByRole("button", { name: "Lançar resultado" }).first().click();
  await page.getByRole("button", { name: "2x0" }).click();
  await page.getByRole("button", { name: "Confirmar resultado" }).click();
  await expect(page.getByText(/O placar foi gravado/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar resultado" })).toHaveCount(0);
  const savedCard = page.locator(".match-card").filter({ has: page.locator(".match-card-team-name", { hasText: /^Dupla 2$/ }) });
  await expect(savedCard.locator(".match-card-team-result > strong")).toHaveText(["2", "0"]);
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
