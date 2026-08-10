import type { NextFunction, Request, Response } from "express";
import { AuthError } from "../services/authService.js";
import { DrawError } from "../services/drawService.js";
import { BracketError } from "../services/bracketService.js";
import { MatchError } from "../services/matchService.js";
import { SimulationError } from "../services/tournamentSimulationService.js";

const KNOWN_ERRORS = [AuthError, DrawError, BracketError, MatchError, SimulationError];

// O Express identifica o middleware de erro pela aridade — os 4 parâmetros são obrigatórios.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (KNOWN_ERRORS.some((ErrorType) => err instanceof ErrorType)) {
    res.status(400).json({ message: (err as Error).message });
    return;
  }

  console.error(err);
  res.status(500).json({ message: "Erro interno do servidor." });
}
