import { Router } from "express";
import { EDITION_GROUP_IDS, EDITION_TEAM_COUNT, MATCHES_PER_GROUP, TEAMS_PER_GROUP, type GroupId } from "@truco/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { computeStandings } from "../services/standingsService.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { generateGroupMatches, planGroupCompletion, type GroupCompletionPlan } from "../services/groupMatchesService.js";
import { generateSchedule } from "../services/schedulerService.js";

export const groupsRoutes = Router();

groupsRoutes.post(
  "/generate-matches",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    const teams = (await store.listTeams(championship.truco_id)).filter((team) => team.status === "aprovada");
    const groupA = teams.filter((team) => team.groupId === "A");
    const groupB = teams.filter((team) => team.groupId === "B");
    if (teams.length !== EDITION_TEAM_COUNT || groupA.length !== TEAMS_PER_GROUP || groupB.length !== TEAMS_PER_GROUP) {
      res.status(409).json({ message: `Defina exatamente ${EDITION_TEAM_COUNT} duplas aprovadas, com ${TEAMS_PER_GROUP} no Grupo A e ${TEAMS_PER_GROUP} no Grupo B.` });
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
    await store.createAllGroupMatches(championship.truco_id, {
      A: generateGroupMatches(groupA.map((team) => team.id)),
      B: generateGroupMatches(groupB.map((team) => team.id)),
    });
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
      res.status(409).json({ message: `Complete os grupos antes: são ${TEAMS_PER_GROUP} duplas aprovadas no Grupo A e ${TEAMS_PER_GROUP} no Grupo B.` });
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
    if (groupId !== "A" && groupId !== "B") {
      res.status(400).json({ message: "Grupo inválido." });
      return;
    }

    // As duas classificações são visíveis a todos os jogadores autenticados.
    const championship = await store.getCurrentChampionship();
    res.json(await computeStandings(championship.truco_id, groupId));
  }),
);
