import { Router } from "express";
import { EDITION_GROUP_IDS, EDITION_TEAM_COUNT, MATCHES_PER_GROUP, TEAMS_PER_GROUP, pendingTieClusters, type GroupId } from "@truco/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { computeStandings } from "../services/standingsService.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { generateGroupMatches, planGroupCompletion, type GroupCompletionPlan } from "../services/groupMatchesService.js";
import { generateSchedule } from "../services/schedulerService.js";
import { ProgressionPendingError, syncKnockoutAfterWrite } from "../services/bracketService.js";
import { withChampionshipLock } from "../utils/championshipLock.js";

export const groupsRoutes = Router();

groupsRoutes.post(
  "/generate-matches",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    const teams = (await store.listTeams(championship.truco_id)).filter((team) => team.status === "aprovada");
    const byGroup = Object.fromEntries(EDITION_GROUP_IDS.map((groupId) => [groupId, teams.filter((team) => team.groupId === groupId)])) as Record<GroupId, typeof teams>;
    if (teams.length !== EDITION_TEAM_COUNT || EDITION_GROUP_IDS.some((groupId) => byGroup[groupId].length !== TEAMS_PER_GROUP)) {
      res.status(409).json({ message: `Defina exatamente ${EDITION_TEAM_COUNT} duplas aprovadas no grupo único da edição.` });
      return;
    }
    const teamIds = new Set(teams.map((team) => team.id));
    if (teamIds.size !== EDITION_TEAM_COUNT || teams.some((team) => !team.groupId)) {
      res.status(409).json({ message: `Cada uma das ${EDITION_TEAM_COUNT} duplas deve pertencer a um único grupo nesta edição.` });
      return;
    }
    const existing = await store.listMatches(championship.truco_id, { stage: "grupos" });
    if (existing.length > 0) {
      res.status(409).json({ message: "Já existem jogos nesta edição; a geração não pode duplicá-los." });
      return;
    }
    await store.createAllGroupMatches(championship.truco_id, Object.fromEntries(
      EDITION_GROUP_IDS.map((groupId) => [groupId, generateGroupMatches(byGroup[groupId].map((team) => team.id))]),
    ) as Record<GroupId, ReturnType<typeof generateGroupMatches>>);
    await store.setDrawStatus(championship.truco_id, "realizado");
    await store.setCurrentPhase(championship.truco_id, "Fase de Grupos");
    res.status(201).json({ matchesCreated: MATCHES_PER_GROUP * EDITION_GROUP_IDS.length });
  }),
);

/**
 * Duplas que entraram depois da geração dos jogos: cria só os confrontos que faltam em cada
 * grupo e refaz a fila dos jogos pendentes. Jogos já existentes — e principalmente os placares
 * já lançados — não são apagados nem alterados.
 */
groupsRoutes.post(
  "/complete-matches",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    const teams = (await store.listTeams(championship.truco_id)).filter((team) => team.status === "aprovada");
    const existing = await store.listMatches(championship.truco_id, { stage: "grupos" });
    if (existing.length === 0) {
      res.status(409).json({ message: "Ainda não há jogos nesta edição; use a geração completa da fase de grupos." });
      return;
    }
    const groupTeams = Object.fromEntries(EDITION_GROUP_IDS.map((groupId) => [groupId, teams.filter((team) => team.groupId === groupId).map((team) => team.id)])) as Record<GroupId, string[]>;
    if (EDITION_GROUP_IDS.some((groupId) => groupTeams[groupId].length !== TEAMS_PER_GROUP)) {
      res.status(409).json({ message: `Complete o grupo antes: são ${TEAMS_PER_GROUP} duplas aprovadas no grupo único.` });
      return;
    }
    let plans: Record<GroupId, GroupCompletionPlan>;
    try {
      plans = Object.fromEntries(EDITION_GROUP_IDS.map((groupId) => [groupId, planGroupCompletion(groupTeams[groupId], existing.filter((match) => match.groupId === groupId))])) as typeof plans;
    } catch (error) {
      res.status(409).json({ message: error instanceof Error ? error.message : "Os jogos existentes não batem com os grupos." });
      return;
    }
    const matchesCreated = EDITION_GROUP_IDS.reduce((total, groupId) => total + plans[groupId].created.length, 0);
    if (matchesCreated === 0) {
      res.status(409).json({ message: "Todos os confrontos da fase de grupos já existem." });
      return;
    }
    for (const groupId of EDITION_GROUP_IDS) {
      await store.createGroupMatches(championship.truco_id, groupId, plans[groupId].created);
      await store.setPendingMatchOrders(plans[groupId].reordered);
    }
    // A escala só reorganiza jogos pendentes; partidas realizadas mantêm placar e posição.
    await generateSchedule(championship.truco_id);
    res.status(201).json({ matchesCreated });
  }),
);

/**
 * Decisão do administrador para um empate que sobreviveu aos cinco critérios da classificação:
 * recebe as duplas empatadas na ordem final e grava a posição de cada uma. Só vale com o
 * grupo encerrado e com empate pendente (e, com empate pendente, o mata-mata não existe).
 * Decidido o último empate, o mata-mata é gerado na mesma chamada.
 */
groupsRoutes.post(
  "/:id/tiebreak",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (req, res) => {
    const groupId = String(req.params.id).toUpperCase() as GroupId;
    const orderedTeamIds: unknown = req.body?.orderedTeamIds;
    if (!(EDITION_GROUP_IDS as readonly unknown[]).includes(groupId) || !Array.isArray(orderedTeamIds) || orderedTeamIds.some((teamId) => typeof teamId !== "string")) {
      res.status(400).json({ message: "Informe o grupo e as duplas empatadas na ordem final." });
      return;
    }
    const championship = await store.getCurrentChampionship();
    // Na mesma fila dos placares: a decisão e a geração do mata-mata não se intercalam com um lançamento.
    const outcome = await withChampionshipLock(championship.truco_id, async (): Promise<{ status: number; message: string } | null> => {
      if ((await store.listBracketMatches(championship.truco_id)).length > 0) {
        return { status: 409, message: "O mata-mata já foi gerado; a classificação não pode mais mudar." };
      }
      const rows = await computeStandings(championship.truco_id, groupId);
      const chosen = new Set(orderedTeamIds as string[]);
      const cluster = pendingTieClusters(rows).find((item) => item.length === chosen.size && item.every((row) => chosen.has(row.teamId)));
      if (!cluster || chosen.size !== orderedTeamIds.length) {
        return { status: 409, message: "Essas duplas não formam um empate pendente neste grupo. Atualize a página e confira a classificação." };
      }
      const positions = cluster.map((row) => row.position).sort((a, b) => a - b);
      await store.saveStandingOverrides({
        championshipId: championship.truco_id,
        groupRowId: await store.getGroupRowId(championship.truco_id, groupId),
        actorId: req.authUser!.id,
        decisions: (orderedTeamIds as string[]).map((teamId, index) => ({ teamId, position: positions[index] })),
      });
      try {
        await syncKnockoutAfterWrite(championship.truco_id);
      } catch (error) {
        if (!(error instanceof ProgressionPendingError)) throw error;
        return { status: 503, message: "A decisão foi gravada. A geração automática do mata-mata ainda não terminou e será concluída pelo servidor em instantes; não é preciso decidir de novo." };
      }
      return null;
    });
    if (outcome) {
      res.status(outcome.status).json({ message: outcome.message });
      return;
    }
    res.status(201).json(await computeStandings(championship.truco_id, groupId));
  }),
);

groupsRoutes.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    res.json(await store.listGroups(championship.truco_id));
  }),
);

groupsRoutes.get(
  "/:id/standings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const groupId = String(req.params.id).toUpperCase() as GroupId;
    if (!(EDITION_GROUP_IDS as readonly unknown[]).includes(groupId)) {
      res.status(400).json({ message: "Grupo inválido." });
      return;
    }

    // As duas classificações são visíveis a todos os jogadores autenticados.
    const championship = await store.getCurrentChampionship();
    res.json(await computeStandings(championship.truco_id, groupId));
  }),
);
