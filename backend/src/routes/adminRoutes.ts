import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { performDraw } from "../services/drawService.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { withChampionshipLock } from "../utils/championshipLock.js";
import { AccessError, listAccessStatus, resetPlayerAccess, restartEditionAccess } from "../services/accessService.js";

export const adminRoutes = Router();

adminRoutes.post(
  "/sorteio",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    if (championship.edition === 5) {
      res.status(409).json({ message: "A 5ª edição usa grupos definidos manualmente. O sorteio automático está desativado." });
      return;
    }
    await performDraw(championship.truco_id);
    res.json({
      groups: await store.listGroups(championship.truco_id),
      teams: await store.listTeams(championship.truco_id),
      drawStatus: "realizado",
    });
  }),
);

// Cadeado global de resultados: só administradores abrem ou fecham.
adminRoutes.post(
  "/results-lock",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (req, res) => {
    const locked: unknown = req.body?.locked;
    if (typeof locked !== "boolean") {
      res.status(400).json({ message: "Informe locked: true para bloquear ou false para liberar." });
      return;
    }
    const championship = await store.getCurrentChampionship();
    await store.setResultsLocked(championship.truco_id, locked);
    res.json({ locked });
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
    // Na fila do campeonato, para não cruzar com um placar em andamento.
    await withChampionshipLock(championship.truco_id, async () => {
      await store.clearMatchesAndBracket(championship.truco_id);
      await store.clearTeamGroups(championship.truco_id);
      await store.setDrawStatus(championship.truco_id, "pendente");
      await store.setCurrentPhase(championship.truco_id, "Aguardando sorteio");
    });
    res.status(204).send();
  }),
);

// Acesso dos jogadores: situação de cada conta (nunca a senha), "Redefinir acesso" e o reinício
// do acesso de todos os participantes da edição.
const accessFailure = (res: import("express").Response, error: unknown): boolean => {
  if (!(error instanceof AccessError)) return false;
  res.status(error.status).json({ message: error.message, code: error.code });
  return true;
};

adminRoutes.get(
  "/players/access",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (_req, res) => {
    res.json(await listAccessStatus());
  }),
);

adminRoutes.post(
  "/players/:playerId/reset-access",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (req, res) => {
    try {
      res.json(await resetPlayerAccess(req.authUser!, String(req.params.playerId)));
    } catch (error) {
      if (!accessFailure(res, error)) throw error;
    }
  }),
);

adminRoutes.post(
  "/access/restart",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (req, res) => {
    try {
      res.json(await restartEditionAccess(req.authUser!));
    } catch (error) {
      if (!accessFailure(res, error)) throw error;
    }
  }),
);
