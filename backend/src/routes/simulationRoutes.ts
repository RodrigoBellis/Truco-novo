import { Router, type NextFunction, type Request, type Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { currentEnvironment, isSimulationEnabled } from "../utils/environment.js";
import { DEFAULT_SIMULATION_SEED } from "../utils/seededRandom.js";
import { runFullSimulation, resetSimulation } from "../services/tournamentSimulationService.js";

export const simulationRoutes = Router();

function requireDevEnvironment(_req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === "production" || !isSimulationEnabled()) {
    res.status(403).json({ message: "O modo de simulação está disponível apenas em ambiente de desenvolvimento." });
    return;
  }
  next();
}

simulationRoutes.get(
  "/status",
  asyncHandler((_req, res) => {
    res.json({
      enabled: isSimulationEnabled(),
      environment: currentEnvironment(),
      defaultSeed: DEFAULT_SIMULATION_SEED,
    });
  }),
);

simulationRoutes.post(
  "/run",
  requireDevEnvironment,
  asyncHandler((req, res) => {
    const { seed } = req.body ?? {};
    const parsedSeed = Number(seed);
    const report = runFullSimulation({ seed: Number.isFinite(parsedSeed) && seed !== undefined ? parsedSeed : undefined });
    res.json(report);
  }),
);

simulationRoutes.post(
  "/reset",
  requireDevEnvironment,
  asyncHandler((_req, res) => {
    resetSimulation();
    res.status(204).send();
  }),
);
