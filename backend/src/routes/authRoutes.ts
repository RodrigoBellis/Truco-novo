import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { adminLogin, login, changePassword } from "../services/authService.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const authRoutes = Router();

authRoutes.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, playerId, password } = req.body ?? {};
    const result = await login(
      { email: email ? String(email) : undefined, playerId: playerId ? String(playerId) : undefined },
      String(password ?? ""),
      req.ip ?? "desconhecido",
    );
    res.setHeader("Cache-Control", "no-store");
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

// Administrador: só a senha. A conta administrativa é resolvida no backend.
authRoutes.post(
  "/admin-login",
  asyncHandler(async (req, res) => {
    const result = await adminLogin(String(req.body?.password ?? ""), req.ip ?? "desconhecido");
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  }),
);
