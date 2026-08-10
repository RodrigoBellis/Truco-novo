import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";

export const teamsRoutes = Router();

teamsRoutes.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    res.json(await store.listTeams(championship.truco_id));
  }),
);

teamsRoutes.post(
  "/:id/approve",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (req, res) => {
    const teamId = String(req.params.id);
    const team = await store.getTeam(teamId);
    if (!team) {
      res.status(404).json({ message: "Dupla não encontrada." });
      return;
    }
    res.json(await store.approveTeam(teamId));
  }),
);

teamsRoutes.post(
  "/:id/reject",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (req, res) => {
    const teamId = String(req.params.id);
    const team = await store.getTeam(teamId);
    if (!team) {
      res.status(404).json({ message: "Dupla não encontrada." });
      return;
    }
    await store.rejectTeam(teamId);
    res.status(204).send();
  }),
);

teamsRoutes.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (req, res) => {
    const teamId = String(req.params.id);
    const team = await store.getTeam(teamId);
    if (!team) {
      res.status(404).json({ message: "Dupla não encontrada." });
      return;
    }
    const { name } = req.body ?? {};
    if (typeof name === "string" && name.trim()) {
      res.json(await store.renameTeam(teamId, name.trim()));
      return;
    }
    res.json(team);
  }),
);
