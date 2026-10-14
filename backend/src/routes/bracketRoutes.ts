import { Router } from "express";
import { isEditionFinished, type KnockoutStatus } from "@truco/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { describeGroupStageBlock, inspectKnockout, syncKnockoutLocked } from "../services/bracketService.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";

export const bracketRoutes = Router();

// Consultas nunca reconciliam ou alteram confrontos.
bracketRoutes.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    res.json(await store.listBracketMatches(championship.truco_id));
  }),
);

/** Situação do mata-mata e da edição, só leitura. */
bracketRoutes.get(
  "/status",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    const [plan, bracket, champion] = await Promise.all([
      inspectKnockout(championship.truco_id),
      store.listBracketMatches(championship.truco_id),
      store.getEditionChampion(championship.truco_id),
    ]);
    // Campeão registrado: a final tem placar e o histórico já corresponde a ela. A edição só está
    // encerrada quando, além disso, a disputa de 3º lugar também tem placar (fase "Campeonato Finalizado").
    const recorded = champion !== null && !plan.steps.some((step) => step.type === "record-champion") && plan.anomalies.length === 0;
    const finished = recorded && isEditionFinished(championship.current_phase);
    const team = async (teamId: string | null | undefined) => {
      const row = teamId ? await store.getTeam(teamId) : undefined;
      return row ? { teamId: row.id, teamName: row.name } : null;
    };
    const payload: KnockoutStatus = {
      phase: championship.current_phase,
      groupStage: plan.status,
      pendingTieGroups: plan.pendingTieGroups,
      bracketGenerated: bracket.length > 0,
      editionFinished: finished,
      champion: recorded ? await team(champion?.championTeamId) : null,
      runnerUp: recorded ? await team(champion?.runnerUpTeamId) : null,
      finalResult: recorded ? (champion?.finalResult ?? null) : null,
      syncPending: plan.steps.length > 0 || championship.progression_pending === true,
      anomalies: plan.anomalies,
    };
    res.json(payload);
  }),
);

/**
 * Reconciliação manual, para o administrador. O mata-mata é gerado sozinho; esta rota só roda
 * a mesma sincronização idempotente (não gera nada que o automático não geraria) e devolve o
 * chaveamento. Com a fase de grupos em aberto ou empate pendente, responde 409 com o motivo.
 */
bracketRoutes.post(
  "/generate",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    const report = await syncKnockoutLocked(championship.truco_id);
    const blocked = describeGroupStageBlock(report);
    if (blocked) {
      res.status(409).json({ message: blocked });
      return;
    }
    res.json(await store.listBracketMatches(championship.truco_id));
  }),
);
