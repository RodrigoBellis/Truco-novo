import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { AvatarError, uploadPlayerAvatar } from "../services/avatarService.js";

export const playersRoutes = Router();

/**
 * Público — a tela de login precisa listar os jogadores antes de existir sessão.
 * Devolve apenas id e nome: o e-mail não sai daqui. Para entrar, o frontend manda o
 * playerId em /auth/login, então o e-mail nunca precisa trafegar sem autenticação.
 */
playersRoutes.get(
  "/roster",
  asyncHandler(async (_req, res) => {
    const players = await store.listPlayers();
    res.json(
      players
        .filter((p) => p.role === "jogador")
        .map((p) => ({ id: p.id, name: p.name })),
    );
  }),
);

/** Cadastro completo (inclui e-mail) — exige sessão válida. */
playersRoutes.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const players = await store.listPlayers();
    res.json(players.filter((p) => p.role === "jogador"));
  }),
);

/** Cada jogador só pode trocar a própria foto — nunca a de outro. */
playersRoutes.post(
  "/me/avatar",
  requireAuth,
  asyncHandler(async (req, res) => {
    const playerId = req.authUser?.playerId;
    if (!playerId) {
      res.status(403).json({ message: "Somente jogadores têm foto de perfil." });
      return;
    }

    const { imageDataUrl } = req.body as { imageDataUrl?: string };
    if (!imageDataUrl) {
      res.status(400).json({ message: "Envie a imagem em imageDataUrl." });
      return;
    }

    try {
      const avatarUrl = await uploadPlayerAvatar(playerId, imageDataUrl);
      res.json({ avatarUrl });
    } catch (err) {
      if (err instanceof AvatarError) {
        res.status(400).json({ message: err.message });
        return;
      }
      throw err;
    }
  }),
);
