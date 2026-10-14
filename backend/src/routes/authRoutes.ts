import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { login, changePassword } from "../services/authService.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { AccessError, createFirstPassword } from "../services/accessService.js";

export const authRoutes = Router();

authRoutes.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, playerId, password } = req.body ?? {};
    const result = await login(
      { email: email ? String(email) : undefined, playerId: playerId ? String(playerId) : undefined },
      String(password ?? ""),
    );
    res.json(result);
  }),
);

// Só troca a senha de quem está autenticado, e só a própria: a conta vem do token validado
// por requireAuth, nunca de um e-mail enviado no corpo da requisição.
authRoutes.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { newPassword, currentPassword } = req.body ?? {};
    const user = await changePassword(req.authUser!.id, String(newPassword ?? ""), currentPassword === undefined ? undefined : String(currentPassword));
    res.json({ user });
  }),
);

// Primeiro acesso da 5ª edição: o jogador escolhe a carta e cria a própria senha. Só funciona
// enquanto a conta está "Aguardando criação de senha" e uma única vez.
authRoutes.post(
  "/first-access",
  asyncHandler(async (req, res) => {
    const { playerId, newPassword } = req.body ?? {};
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await createFirstPassword(String(playerId ?? ""), String(newPassword ?? ""), req.ip ?? "desconhecido"));
    } catch (error) {
      if (!(error instanceof AccessError)) throw error;
      res.status(error.status).json({ message: error.message, code: error.code });
    }
  }),
);
