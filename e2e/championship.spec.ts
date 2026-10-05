import { expect, test, type Page } from "@playwright/test";

const players = Array.from({ length: 20 }, (_, index) => ({
  id: `player-${index + 1}`,
  name: `Jogador ${index + 1}`,
  role: "jogador",
  teamId: null,
  avatarUrl: null,
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

const matches = Array.from({ length: 20 }, (_, index) => ({
  id: `match-${index + 1}`,
  championshipId: "edition-5",
  stage: "grupos",
  round: index < 10 ? "Grupo A" : "Grupo B",
  order: index < 10 ? index : index - 10,
  groupId: index < 10 ? "A" : "B",
  teamAId: teams[index < 10 ? 0 : 5].id,
  teamBId: teams[index < 10 ? 1 : 6].id,
  result: null,
  status: "pendente",
  tableNumber: null,
  blockNumber: null,
  queuePosition: null,
}));

async function installSession(page: Page, role: "admin" | "jogador", teamId: string | null = null) {
  await page.addInitScript(({ role: sessionRole, teamId: sessionTeamId }) => {
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
      token: "test-token",
      refreshToken: "test-refresh",
    }));
  }, { role, teamId });
}

async function mockCoreApi(page: Page, role: "admin" | "jogador", resultSaved = false, smallTeamList = false, noMatches = false) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let payload: unknown = {};
    if (url.pathname.endsWith("/players") && route.request().method() === "POST") payload = { id: "new-player", name: "Nova Pessoa", role: "jogador", teamId: null, avatarUrl: null };
    else if (url.pathname.endsWith("/teams") && route.request().method() === "POST") payload = { ...teams[0], name: route.request().postDataJSON().name };
    else if (url.pathname.endsWith("/teams")) payload = smallTeamList ? teams.slice(0, 8) : teams;
    else if (url.pathname.endsWith("/players")) payload = players;
    else if (url.pathname.endsWith("/groups")) payload = groups;
    else if (url.pathname.includes("/standings")) payload = standings(url.pathname.endsWith("/A/standings") ? teams.slice(0, 5) : teams.slice(5));
    else if (url.pathname.endsWith("/matches/audit")) payload = [];
    else if (url.pathname.endsWith("/matches")) payload = noMatches ? [] : matches.map((match, index) => index === 0 && resultSaved ? { ...match, result: { setsA: 2, setsB: 0 }, status: "realizado" } : match);
    else if (url.pathname.endsWith("/bracket")) payload = [];
    else if (url.pathname.endsWith("/dashboard")) payload = { currentPhase: "Fase de Grupos", drawStatus: "realizado", pendingApprovals: 0, upcomingMatches: [], stats: {} };
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

test("Hall da Fama mostra somente a edição histórica armazenada", async ({ page }) => {
  await mockCoreApi(page, "jogador");
  await page.route("**/rest/v1/truco_history**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ truco_id: "hist-4", edition: 4, name: "4ª Edição", year: 2025, final_result: "2x1", notes: "", champion: { name: "Campeões" , truco_team_members: [{ position: 1, truco_players: { name: "Campeão 1" } }, { position: 2, truco_players: { name: "Campeão 2" } }] }, runner_up: null }]) }));
  await page.route("**/rest/v1/truco_championships**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ edition: 5, year: 2026 }]) }));
  await page.goto("/hall-da-fama");
  await expect(page.getByRole("heading", { name: "Hall da Fama" })).toBeVisible();
  await expect(page.getByText("Campeão 1").first()).toBeVisible();
});
