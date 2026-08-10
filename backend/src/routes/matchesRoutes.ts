import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { recordResult } from "../services/matchService.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const matchesRoutes = Router();

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

    if (req.authUser!.role === "jogador") {
      const match = await store.getMatch(matchId);
      const myTeamId = await store.getTeamIdForPlayer(req.authUser!.playerId);
      const isMyMatch = match && myTeamId && (match.teamAId === myTeamId || match.teamBId === myTeamId);
      if (!isMyMatch) {
        res.status(403).json({ message: "Você só pode registrar o resultado de um jogo da sua dupla." });
        return;
      }
      // Corrigir um resultado já lançado é privilégio do admin — o jogador só lança uma vez.
      if (match.status === "realizado") {
        res.status(403).json({ message: "Esse resultado já foi registrado. Peça a um admin para corrigir." });
        return;
      }
    }

    await recordResult(championship.truco_id, matchId, { setsA: Number(setsA), setsB: Number(setsB) });
    res.json(await store.getMatch(matchId));
  }),
);
