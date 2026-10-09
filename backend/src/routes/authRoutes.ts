import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { login, changePassword } from "../services/authService.js";
import { requireAuth } from "../middleware/requireAuth.js";

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
    const { newPassword } = req.body ?? {};
    const user = await changePassword(req.authUser!.id, String(newPassword ?? ""));
    res.json({ user });
  }),
);
