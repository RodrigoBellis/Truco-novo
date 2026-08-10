import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { generateSchedule } from "../services/schedulerService.js";
import { getMatchQueueForChampionship, getMyQueueStatus } from "../services/boardsService.js";

export const scheduleRoutes = Router();

/** Gera/regenera a escala de mesas da fase de grupos. Ação administrativa. */
scheduleRoutes.post(
  "/generate",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    const assignments = await generateSchedule(championship.truco_id);
    res.json({ assignmentsCount: assignments.length });
  }),
);

/** "Ordem dos Jogos" — fila única e sequencial, visível a qualquer usuário autenticado
 *  (operacional, como um placar físico de torneio: mostra apenas confrontos/placar, não
 *  agenda privada de ninguém). Mesa (1-3) é só um detalhe interno do escalonador e nunca
 *  aparece aqui — ver comentário em boardsService.ts. */
scheduleRoutes.get(
  "/queue",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    res.json(await getMatchQueueForChampionship(championship.truco_id));
  }),
);

/** Status da fila para a dupla do jogador logado (admin não tem dupla própria). */
scheduleRoutes.get(
  "/my-status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const championship = await store.getCurrentChampionship();
    const status = await getMyQueueStatus(championship.truco_id, req.authUser!.playerId);
    res.json(status);
  }),
);

/** Ajuste manual do admin: trocar a mesa e/ou a posição na fila de uma partida específica. */
scheduleRoutes.patch(
  "/matches/:id",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (req, res) => {
    const { tableNumber, queuePosition } = req.body ?? {};
    const matchId = String(req.params.id);

    if (tableNumber !== undefined && tableNumber !== null && ![1, 2, 3].includes(Number(tableNumber))) {
      res.status(400).json({ message: "Mesa inválida. Use 1, 2 ou 3." });
      return;
    }

    await store.setMatchSchedule(matchId, {
      tableNumber: tableNumber === undefined ? undefined : tableNumber === null ? null : Number(tableNumber),
      queuePosition: queuePosition === undefined ? undefined : queuePosition === null ? null : Number(queuePosition),
    });
    res.json(await store.getMatch(matchId));
  }),
);
