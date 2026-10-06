import { expect, test, type Page } from "@playwright/test";

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
  derrotas: 0,
  pontos: 0,
  saldoSets: 0,
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

async function installSession(page: Page, role: "admin" | "jogador", teamId: string | null = null, expired = false) {
  const authUser = { id: "auth-user", aud: "authenticated", role: "authenticated", email: "test@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.route("**/auth/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const payload = path.endsWith("/token")
      ? { access_token: testToken(false, "renewed"), refresh_token: "renewed-test-refresh", token_type: "bearer", expires_in: 3600, user: authUser }
      : authUser;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
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
  await expect(page.getByText("Semifinal").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Repescagem").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Eliminado").filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Gerar 20 jogos da fase de grupos" }).click();
  await expect(page.getByText("20 jogos criados com os grupos definidos pelo administrador.")).toBeVisible();
});

test("jogador visualiza dupla e parceiro, lança e corrige resultado", async ({ page }) => {
  await mockCoreApi(page, "jogador", true);
  await page.goto("/minha-dupla");
  await expect(page.getByText("Parceiro de dupla")).toBeVisible();
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
  await expect(page.getByText("Dupla 6").first()).toBeVisible();
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

  await page.getByRole("tab", { name: "Grupo A" }).click();
  await expect(page.locator(".match-card")).toHaveCount(10);

  await page.getByRole("tab", { name: "Grupo B" }).click();
  await expect(page.locator(".match-card")).toHaveCount(10);
  await expect(page.getByText("Dupla 6").first()).toBeVisible();
  await expect(page.locator(".match-card-mine")).toHaveCount(0);
  await expect(myTeamBanner).toContainText("Está no Grupo A");
  await page.getByRole("tab", { name: "Todos", exact: true }).click();
  await expect(page.locator(".match-card")).toHaveCount(20);

  await page.getByLabel("Filtrar por situação").selectOption("finished");
  await expect(page.locator(".match-card")).toHaveCount(1);
  await expect(page.locator(".match-card-score")).toHaveText("2x0");
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
  await expect(page.locator(".my-team-player-card .player-avatar img").first()).toHaveAttribute("src", "/avatars/player-1.webp");
  await expect(page.locator(".my-team-player-card .player-avatar img").nth(1)).toHaveAttribute("src", "/avatars/player-2.webp");
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

test("rota de mata-mata informa que os cruzamentos da repescagem aguardam definição", async ({ page }) => {
  await mockCoreApi(page, "admin");
  await page.goto("/admin/mata-mata");
  await expect(page.getByText(/cruzamentos entre Grupo A e Grupo B ainda precisam ser definidos/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar mata-mata" })).toHaveCount(0);
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
  await expect(page.getByRole("region", { name: "Resumo da sua dupla" })).toContainText("Dupla 1");
  await expect(page.locator(".team-identity-members")).toContainText("Seu parceiro");
  await expect(page.locator(".team-identity-details")).toContainText("Força 1/5");
  await expect(page.getByRole("heading", { name: "Próximo confronto" })).toBeVisible();
  await expect(page.locator(".home-opponent")).toContainText("Dupla 2");
  await page.goto("/");
  await expect(page).toHaveURL(/\/inicio$/);
});

test("ranking preserva empates e jogos de outras duplas não oferecem edição", async ({ page }) => {
  await mockCoreApi(page, "jogador", true);
  await page.goto("/maiores-campeoes");
  await expect(page.locator(".champions-podium-place-2")).toHaveCount(2);
  await expect(page.locator(".major-row")).toHaveCount(3);
  await page.goto("/jogos");
  await page.getByRole("tab", { name: "Grupo B" }).click();
  await expect(page.locator(".match-card")).toHaveCount(10);
  await expect(page.getByRole("button", { name: /Lançar resultado|Editar resultado/ })).toHaveCount(0);
  await expect(page.locator(".match-card .team-strength")).toHaveCount(20);
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

test("Grupos reconhece uma dupla do Grupo B e permite trocar pelo teclado", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.addInitScript(() => {
    const session = JSON.parse(localStorage.getItem("truco-do-novo:session")!);
    session.user.teamId = "team-6";
    session.user.playerId = "player-11";
    localStorage.setItem("truco-do-novo:session", JSON.stringify(session));
  });
  await page.goto("/grupos");
  const ownTab = page.getByRole("tab", { name: "Grupo B · Seu grupo" });
  await expect(ownTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".standings-row-mine")).toContainText("Dupla 6");
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
  ...["/inicio", "/abertura", "/hall-da-fama", "/maiores-campeoes", "/minha-dupla", "/grupos", "/jogos", "/perfil"].map((path) => ({ role: "jogador" as const, path })),
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
    await mockCoreApi(page, role);
    await page.route("**/api/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ totalPlayers: 20, totalTeams: 10, pendingApprovals: 0, approvedTeams: 10, drawStatus: "realizado", matchesPlayed: 0, matchesPending: 20, currentPhase: "Fase de Grupos", nextMatches: [], champion: null }) }));
    await page.route("**/api/schedule/queue", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }));
    await page.route("**/rest/v1/truco_history**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ANIMATED_HISTORY) }));
    await page.route("**/rest/v1/truco_championships**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ edition: 5, year: 2026 }]) }));
    await page.goto(path);
    await expect(page.locator(".page-enter").first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __animations: string[] }).__animations.includes("rise-in"))).toBe(true);
    // Ao terminar, nenhum bloco pode reter transform: isso deslocaria modais fixos.
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running" && animation.timeline === document.timeline).length)).toBe(0);
    const state = await page.evaluate(() => ({
      retained: Array.from(document.querySelectorAll(".page-enter > *")).filter((element) => getComputedStyle(element).transform !== "none" || getComputedStyle(element).opacity !== "1").length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(state.retained).toBe(0);
    expect(state.overflow).toBeLessThanOrEqual(0);
    expect(pageErrors).toEqual([]);
    if (process.env.MOTION_SHOTS) await page.screenshot({ path: `${process.env.MOTION_SHOTS}/${testInfo.project.name}${path.replaceAll("/", "_")}.png` });
  });
}

test("movimento reduzido mostra o conteúdo sem deslocamento", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockCoreApi(page, "jogador");
  await page.goto("/inicio");
  const header = page.locator(".page-enter > *").first();
  await expect(header).toBeVisible();
  await expect(header).toHaveCSS("opacity", "1");
  await expect(header).toHaveCSS("transform", "none");
});
