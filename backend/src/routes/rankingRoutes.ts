import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const rankingRoutes = Router();

rankingRoutes.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await store.listRanking());
  }),
);
