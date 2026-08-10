import { Router } from "express";
import type { HallOfFame } from "@truco/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";

export const historyRoutes = Router();

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
