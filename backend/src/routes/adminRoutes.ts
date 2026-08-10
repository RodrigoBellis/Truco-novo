import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { performDraw } from "../services/drawService.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";

export const adminRoutes = Router();

adminRoutes.post(
  "/sorteio",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    await performDraw(championship.truco_id);
    res.json({
      groups: await store.listGroups(championship.truco_id),
      teams: await store.listTeams(championship.truco_id),
      drawStatus: "realizado",
    });
  }),
);

// Reserva o "reset" para o dono do banco (superadmin): limpa sorteio/jogos/mata-mata da
// edição em andamento — nunca apaga duplas, histórico ou jogadores.
adminRoutes.post(
  "/reset",
  requireAuth,
  requireRole("superadmin"),
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    await store.clearMatchesAndBracket(championship.truco_id);
    await store.clearTeamGroups(championship.truco_id);
    await store.setDrawStatus(championship.truco_id, "pendente");
    await store.setCurrentPhase(championship.truco_id, "Aguardando sorteio");
    res.status(204).send();
  }),
);
