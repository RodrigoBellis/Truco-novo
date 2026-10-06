import { Router } from "express";
import type { HallOfFame } from "@truco/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getMajorChampions } from "../services/majorChampionsService.js";

export const historyRoutes = Router();

historyRoutes.get("/major-champions", requireAuth, asyncHandler(async (_req, res) => {
  res.json(await getMajorChampions());
}));

historyRoutes.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [editions, championship] = await Promise.all([store.listHistory(), store.getCurrentChampionship()]);
    const payload: HallOfFame = {
      editions: [...editions].sort((a, b) => a.edition - b.edition),
      currentEdition: championship.edition,
      currentYear: championship.year,
    };
    res.json(payload);
  }),
);
