import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { EditionFinishedError, ResultConflictError, ResultPermissionError, recordResult } from "../services/matchService.js";
import { ProgressionPendingError } from "../services/bracketService.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { RESULTS_LOCKED_MESSAGE } from "@truco/shared";
import { canRecordEditionResult, resultsLockBlocks } from "../services/matchAuthorization.js";

export const matchesRoutes = Router();

matchesRoutes.get(
  "/audit",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    res.json(await store.listMatchResultAudit(championship.truco_id));
  }),
);

// Estado do cadeado de resultados: qualquer usuário autenticado pode consultar.
matchesRoutes.get(
  "/lock",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    res.json({ locked: store.isResultsLocked(championship) });
  }),
);

matchesRoutes.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stage, groupId, teamId } = req.query;
    const championship = await store.getCurrentChampionship();

    const matches = await store.listMatches(championship.truco_id, {
      stage: typeof stage === "string" ? stage : undefined,
      groupLabel: typeof groupId === "string" ? groupId : undefined,
      // teamId da query só é respeitado para admin/superadmin — jogador é filtrado abaixo,
      // independentemente do que o cliente enviar aqui.
      teamId: req.authUser!.role === "jogador" ? undefined : typeof teamId === "string" ? teamId : undefined,
    });

    // A agenda e os placares são públicos para usuários autenticados em ambos os grupos.
    // A autorização de escrita permanece no POST /:id/result e valida a dupla participante.
    res.json(matches);
  }),
);

matchesRoutes.post(
  "/:id/result",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { setsA, setsB } = req.body ?? {};
    const matchId = String(req.params.id);
    const championship = await store.getCurrentChampionship();

    // Cadeado global: esconder o botão na tela não basta, a recusa é aqui. Vale para criar e
    // para editar, e vem antes de qualquer outra checagem.
    if (resultsLockBlocks(req.authUser!.role, store.isResultsLocked(championship))) {
      res.status(403).json({ message: RESULTS_LOCKED_MESSAGE, code: "results_locked" });
      return;
    }

    const match = await store.getMatch(matchId);
    if (!match) {
      res.status(404).json({ message: "Jogo não encontrado." });
      return;
    }
    const participants = await store.getMatchPlayerIds(championship.truco_id, match.teamAId, match.teamBId);
    if (!canRecordEditionResult(req.authUser!.role, req.authUser!.playerId, participants.playerIds, match.championshipId === championship.truco_id)) {
        res.status(403).json({ message: "Você só pode registrar o resultado de um jogo da sua dupla nesta edição." });
        return;
    }

    // Recusas: 403 = quem pede não pode (cadeado, não é da partida, edição encerrada);
    // 409 = o estado do campeonato não permite essa alteração; 400 = placar inválido.
    try {
      await recordResult(championship.truco_id, matchId, { setsA: Number(setsA), setsB: Number(setsB) }, { id: req.authUser!.id, role: req.authUser!.role });
    } catch (error) {
      if (error instanceof ResultPermissionError) {
        res.status(403).json({ message: error.message, code: error.code });
        return;
      }
      if (error instanceof EditionFinishedError) {
        res.status(403).json({ message: error.message, code: "edition_finished" });
        return;
      }
      if (error instanceof ResultConflictError) {
        res.status(409).json({ message: error.message, code: "result_conflict" });
        return;
      }
      if (error instanceof ProgressionPendingError) {
        res.status(503).json({ message: error.message, code: "progression_pending", resultSaved: true, retryable: error.retryable });
        return;
      }
      throw error;
    }
    res.json(await store.getMatch(matchId));
  }),
);
