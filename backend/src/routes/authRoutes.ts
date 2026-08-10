import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { login, changePassword } from "../services/authService.js";

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

authRoutes.post(
  "/change-password",
  asyncHandler(async (req, res) => {
    const { email, newPassword } = req.body ?? {};
    const user = await changePassword(String(email ?? ""), String(newPassword ?? ""));
    res.json({ user });
  }),
);
