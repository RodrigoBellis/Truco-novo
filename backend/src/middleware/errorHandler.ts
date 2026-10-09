import type { NextFunction, Request, Response } from "express";
import { AuthError } from "../services/authService.js";
import { DrawError } from "../services/drawService.js";
import { BracketError, ProgressionPendingError } from "../services/bracketService.js";
import { MatchError } from "../services/matchService.js";
import { SimulationError } from "../services/tournamentSimulationService.js";
import { EditionSetupError } from "../services/editionSetupError.js";
import { StoreConflictError, StoreOperationError } from "../data/storeErrors.js";

const KNOWN_ERRORS = [AuthError, DrawError, BracketError, MatchError, SimulationError];

// O Express identifica o middleware de erro pela aridade — os 4 parâmetros são obrigatórios.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof EditionSetupError) {
    res.status(503).json({ message: err.message });
    return;
  }

  if (err instanceof ProgressionPendingError) {
    res.status(503).json({ message: err.message, code: "progression_pending", resultSaved: true, retryable: err.retryable });
    return;
  }

  if (err instanceof StoreOperationError) {
    // A resposta não expõe detalhes do banco; o registro do servidor precisa deles para o diagnóstico.
    console.error(`[banco] ${err.message} (código ${err.code})${err.detail ? `: ${err.detail}` : ""}`);
    res.status(err.retryable ? 503 : 500).json({ message: err.retryable ? "Conexão temporariamente indisponível. Atualize os dados antes de tentar novamente." : "A operação exige revisão do administrador.", code: err.retryable ? "store_unavailable" : "store_configuration", retryable: err.retryable });
    return;
  }
  if (err instanceof StoreConflictError) {
    res.status(409).json({ message: "O campeonato mudou. Atualize os dados antes de tentar novamente.", code: "state_conflict", retryable: false });
    return;
  }

  if (KNOWN_ERRORS.some((ErrorType) => err instanceof ErrorType)) {
    res.status(400).json({ message: (err as Error).message });
    return;
  }

  console.error(err);
  res.status(500).json({ message: "Erro interno do servidor." });
}
