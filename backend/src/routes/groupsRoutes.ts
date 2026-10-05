import { Router } from "express";
import type { GroupId } from "@truco/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { computeStandings } from "../services/standingsService.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { generateGroupMatches } from "../services/groupMatchesService.js";

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
    if (teams.length !== 10 || groupA.length !== 5 || groupB.length !== 5) {
      res.status(409).json({ message: "Defina exatamente 10 duplas aprovadas, com 5 no Grupo A e 5 no Grupo B." });
      return;
    }
    const teamIds = new Set(teams.map((team) => team.id));
    if (teamIds.size !== 10 || teams.some((team) => !team.groupId)) {
      res.status(409).json({ message: "Cada uma das 10 duplas deve pertencer a um único grupo nesta edição." });
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
    res.status(201).json({ matchesCreated: 20 });
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

    if (req.authUser!.role === "jogador") {
      const myTeamId = await store.getTeamIdForPlayer(req.authUser!.playerId);
      const myTeam = myTeamId ? await store.getTeam(myTeamId) : undefined;
      if (myTeam?.groupId !== groupId) {
        res.status(403).json({ message: "Você só pode ver a classificação do seu próprio grupo." });
        return;
      }
    }

    const championship = await store.getCurrentChampionship();
    res.json(await computeStandings(championship.truco_id, groupId));
  }),
);
