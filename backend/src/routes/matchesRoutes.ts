import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { recordResult } from "../services/matchService.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { canRecordEditionResult } from "../services/matchAuthorization.js";

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

    if (req.authUser!.role === "jogador") {
      const myTeamId = await store.getTeamIdForPlayer(req.authUser!.playerId);
      const myTeam = myTeamId ? await store.getTeam(myTeamId) : undefined;
      const myGroupId = myTeam?.groupId ?? null;

      // "Meus jogos": qualquer partida da própria dupla, em qualquer status.
      // "Resultados do grupo": partidas já realizadas de duplas do mesmo grupo — precisa
      // disso porque afeta a classificação que o jogador acompanha. Jogos PENDENTES de
      // outras duplas continuam invisíveis (não vaza a agenda de quem ele não é).
      const filtered = matches.filter(
        (m) =>
          m.teamAId === myTeamId ||
          m.teamBId === myTeamId ||
          (m.status === "realizado" && myGroupId !== null && m.groupId === myGroupId),
      );
      res.json(filtered);
      return;
    }

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

    await recordResult(championship.truco_id, matchId, { setsA: Number(setsA), setsB: Number(setsB) }, req.authUser!.id);
    res.json(await store.getMatch(matchId));
  }),
);
