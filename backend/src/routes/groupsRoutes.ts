import { Router } from "express";
import type { GroupId } from "@truco/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { computeStandings } from "../services/standingsService.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const groupsRoutes = Router();

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
