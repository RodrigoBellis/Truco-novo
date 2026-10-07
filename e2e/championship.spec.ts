import { expect, test, type Page } from "@playwright/test";
import { snapshotGroups, snapshotMatches, snapshotPlayers, snapshotStandings, snapshotTeams } from "./fixtures/edition5Snapshot";

// Dados fictícios só para os testes, no formato definitivo da edição: 12 duplas, 6 por grupo.
const players = Array.from({ length: 24 }, (_, index) => ({
  id: `player-${index + 1}`,
  name: `Jogador ${index + 1}`,
  role: "jogador",
  teamId: null,
  avatarUrl: index < 2 ? `/avatars/player-${index + 1}.webp` : null,
}));

const teams = Array.from({ length: 12 }, (_, index) => ({
  id: `team-${index + 1}`,
  name: `Dupla ${index + 1}`,
  player1Id: players[index * 2].id,
  player2Id: players[index * 2 + 1].id,
  status: "aprovada",
  seeded: false,
  isPlaceholder: false,
  groupId: index < 6 ? "A" : "B",
  strength: index % 5 + 1,
}));

const groups = [
  { id: "A", name: "Grupo A", teamIds: teams.slice(0, 6).map((team) => team.id) },
  { id: "B", name: "Grupo B", teamIds: teams.slice(6).map((team) => team.id) },
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

const groupPairs = Array.from({ length: 6 }, (_, first) => Array.from({ length: 6 - first - 1 }, (_, offset) => [first, first + offset + 1] as const)).flat();
const matches = Array.from({ length: 30 }, (_, index) => {
  const groupOffset = index < 15 ? 0 : 6;
  const [first, second] = groupPairs[index % 15];
  return ({
  id: `match-${index + 1}`,
  championshipId: "edition-5",
  stage: "grupos",
  round: index < 15 ? "Grupo A" : "Grupo B",
  order: index < 15 ? index : index - 15,
  groupId: index < 15 ? "A" : "B",
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
    else if (url.pathname.includes("/standings")) payload = standings(url.pathname.endsWith("/A/standings") ? teams.slice(0, 6) : teams.slice(6));
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
    else if (url.pathname.endsWith("/groups/generate-matches")) payload = { matchesCreated: 30 };
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

test("admin confere as seis posições e solicita os trinta jogos", async ({ page }) => {
  await mockCoreApi(page, "admin", false, false, true);
  await page.goto("/admin/grupos");
  await expect(page.getByText("Semifinal").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Repescagem").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Eliminado").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("6º", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Gerar 30 jogos da fase de grupos" }).click();
  await expect(page.getByText("30 jogos criados com os grupos definidos pelo administrador.")).toBeVisible();
});

test("admin gera só os jogos que faltam quando duas duplas entram depois", async ({ page }) => {
  await mockCoreApi(page, "admin");
  // Jogos já gerados com 5 duplas por grupo: faltam os das duplas 6 (Grupo A) e 12 (Grupo B).
  const newcomers = ["team-6", "team-12"];
  await page.route("**/api/matches**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(matches.filter((match) => !newcomers.includes(match.teamAId) && !newcomers.includes(match.teamBId))) }));
  let completeCalls = 0;
  await page.route("**/api/groups/complete-matches", (route) => {
    completeCalls += 1;
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ matchesCreated: 10 }) });
  });
  await page.goto("/admin/grupos");
  await expect(page.getByRole("button", { name: /Gerar 30 jogos/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Gerar 10 jogos das duplas novas" }).click();
  await expect(page.getByText("10 jogos criados para as duplas novas. Placar e ordem dos jogos já disputados não mudaram.")).toBeVisible();
  expect(completeCalls).toBe(1);
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
  await expect(page.locator(".match-card")).toHaveCount(5);
  await expect(page.locator(".match-group-title").filter({ hasText: "Grupo B" })).toHaveCount(0);
  const myTeamBanner = page.getByRole("region", { name: "Sua dupla e seu grupo" });
  await expect(myTeamBanner).toContainText("Dupla 1");
  await expect(myTeamBanner).toContainText("Está no Grupo A");
  await expect(page.locator(".match-card-outcome-win")).toHaveCount(1);
  await expect(page.locator(".match-card-outcome-win")).toContainText("Vitória");
  await expect(page.locator(".match-card-outcome-pending")).toHaveCount(4);
  await expect(page.locator(".match-group-title")).toHaveText(["Próximos confrontos4", "Já jogados1"]);
  await expect(myTeamBanner).toContainText("Próximo jogo");

  await page.getByRole("tab", { name: "Grupo A" }).click();
  await expect(page.locator(".match-card")).toHaveCount(15);

  await page.getByRole("tab", { name: "Grupo B" }).click();
  await expect(page.locator(".match-card")).toHaveCount(15);
  await expect(page.getByText("Dupla 7").first()).toBeVisible();
  await expect(page.locator(".match-card-mine")).toHaveCount(0);
  await expect(myTeamBanner).toContainText("Está no Grupo A");
  await page.getByRole("tab", { name: "Todos", exact: true }).click();
  await expect(page.locator(".match-card")).toHaveCount(30);

  await page.getByLabel("Filtrar por situação").selectOption("finished");
  await expect(page.locator(".match-card")).toHaveCount(1);
  await expect(page.locator(".match-card-team-result > strong")).toHaveText(["2", "0"]);
  await expect(page.locator(".match-card-team-winner")).toContainText("Dupla 1");
  await expect(page.locator(".match-card-points").first()).toHaveText("+3 pts");
  await expect(page.locator(".match-card-points").last()).toHaveText("+0 pts");
  await page.getByLabel("Filtrar por situação").selectOption("upcoming");
  await expect(page.locator(".match-card")).toHaveCount(29);
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
type StandingFixture = { position: number; teamId: string; jogos: number; vitorias: number; derrotas: number; pontos: number; saldoSets: number };
interface League {
  players: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string; player1Id: string; player2Id: string; groupId: string | null }>;
  groups: unknown[];
  standings: Record<"A" | "B", StandingFixture[]>;
  matches: Array<{ teamAId: string; teamBId: string; status: string }>;
}

const leagueStandings: Record<"A" | "B", StandingFixture[]> = {
  A: [
    { position: 1, teamId: "team-3", jogos: 5, vitorias: 4, derrotas: 1, pontos: 10, saldoSets: 5 },
    { position: 2, teamId: "team-1", jogos: 5, vitorias: 3, derrotas: 2, pontos: 8, saldoSets: 2 },
    { position: 3, teamId: "team-2", jogos: 5, vitorias: 3, derrotas: 2, pontos: 7, saldoSets: 1 },
    { position: 4, teamId: "team-6", jogos: 5, vitorias: 2, derrotas: 3, pontos: 5, saldoSets: -1 },
    { position: 5, teamId: "team-5", jogos: 5, vitorias: 2, derrotas: 3, pontos: 4, saldoSets: -2 },
    { position: 6, teamId: "team-4", jogos: 5, vitorias: 1, derrotas: 4, pontos: 2, saldoSets: -5 },
  ],
  B: [
    { position: 1, teamId: "team-7", jogos: 4, vitorias: 3, derrotas: 1, pontos: 9, saldoSets: 4 },
    { position: 2, teamId: "team-8", jogos: 4, vitorias: 2, derrotas: 2, pontos: 6, saldoSets: 1 },
    { position: 3, teamId: "team-10", jogos: 4, vitorias: 2, derrotas: 2, pontos: 4, saldoSets: 0 },
    { position: 4, teamId: "team-12", jogos: 4, vitorias: 1, derrotas: 3, pontos: 3, saldoSets: -1 },
    { position: 5, teamId: "team-11", jogos: 4, vitorias: 1, derrotas: 3, pontos: 1, saldoSets: -2 },
    { position: 6, teamId: "team-9", jogos: 4, vitorias: 0, derrotas: 4, pontos: 0, saldoSets: -2 },
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
    else if (url.pathname.endsWith("/B/standings")) payload = league.standings.B;
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

  await openMenu(page, "Início");
  await expect(page.locator(".team-identity-head")).toContainText(teamName);
  await expect(page.locator(".team-identity-position strong")).toHaveAttribute("aria-label", `${row.position}º lugar`);
  await expect(page.locator(".campaign-stats-grid dd")).toHaveText([String(row.pontos), String(row.vitorias), String(row.derrotas), saldo]);

  await openMenu(page, "Minha Dupla");
  await expect(page.locator(".team-identity-head")).toContainText(teamName);
  await expect(page.locator(".team-identity-position strong")).toHaveAttribute("aria-label", `${row.position}º lugar`);
  await expect(page.locator(".campaign-stats-grid dd")).toHaveText([String(row.pontos), String(row.vitorias), String(row.derrotas), saldo]);

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
  await openMenu(page, "Início");
  await expect(page.locator(".campaign-stats-grid dd")).toHaveText(["8", "3", "1", "+3"]);
  await logout(page);

  await loginAs(page, "Vito");
  await expectOwnTeamEverywhere(page, realSnapshotLeague, "Vito & Luizão");
  await openMenu(page, "Início");
  // Vito & Luizão: 1 ponto (derrota por 1x2 para Bagriel & Diguinho), nunca os 8 da outra dupla.
  await expect(page.locator(".campaign-stats-grid dd")).toHaveText(["1", "0", "1", "-1"]);
  await page.reload();
  await expectOwnTeamEverywhere(page, realSnapshotLeague, "Vito & Luizão");
  await logout(page);

  await loginAs(page, "Diguinho");
  await expectOwnTeamEverywhere(page, realSnapshotLeague, "Bagriel & Diguinho");
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
  await expect(page.locator(".match-card")).toHaveCount(15);
  await expect(page.getByRole("button", { name: /Lançar resultado|Editar resultado/ })).toHaveCount(0);
  await expect(page.locator(".match-card .team-strength")).toHaveCount(30);
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
