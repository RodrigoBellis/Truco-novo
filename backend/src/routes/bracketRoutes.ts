import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { generateBracket } from "../services/bracketService.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";

export const bracketRoutes = Router();

bracketRoutes.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    res.json(await store.listBracketMatches(championship.truco_id));
  }),
);

bracketRoutes.post(
  "/generate",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    if (championship.edition === 5) {
      res.status(409).json({ message: "A regra dos cruzamentos da repescagem ainda não foi definida; a geração automática do chaveamento está bloqueada." });
      return;
    }
    await generateBracket(championship.truco_id);
    res.json(await store.listBracketMatches(championship.truco_id));
  }),
);
