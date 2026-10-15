import type { AuthUser, LoginResponse } from "@truco/shared";
import { apiRequest } from "./api";

/** Jogador: playerId da carta escolhida. Administrador: só a senha; a conta é resolvida no backend. */
export type LoginIdentifier = { playerId: string } | { admin: true };

export function login(identifier: LoginIdentifier, password: string): Promise<LoginResponse> {
  if ("admin" in identifier) return apiRequest<LoginResponse>("/auth/admin-login", { method: "POST", body: { password } });
  return apiRequest<LoginResponse>("/auth/login", { method: "POST", body: { playerId: identifier.playerId, password } });
}

/** Troca a senha da conta autenticada; o backend identifica a conta pelo token, não por e-mail. */
export function changePassword(newPassword: string, currentPassword?: string): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>("/auth/change-password", { method: "POST", body: currentPassword === undefined ? { newPassword } : { newPassword, currentPassword } });
}
