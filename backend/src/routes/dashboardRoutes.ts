import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getDashboardStats } from "../services/dashboardService.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const dashboardRoutes = Router();

dashboardRoutes.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await getDashboardStats());
  }),
);
