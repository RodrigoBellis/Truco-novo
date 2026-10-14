import type { AuthUser, LoginResponse } from "@truco/shared";
import { apiRequest } from "./api";

/** Identifica o usuário por e-mail (admin) ou por playerId (jogador escolhido na lista). */
export type LoginIdentifier = { email: string } | { playerId: string };

export function login(identifier: LoginIdentifier, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/login", { method: "POST", body: { ...identifier, password } });
}

/** Troca a senha da conta autenticada; o backend identifica a conta pelo token, não por e-mail. */
export function changePassword(newPassword: string, currentPassword?: string): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>("/auth/change-password", { method: "POST", body: currentPassword === undefined ? { newPassword } : { newPassword, currentPassword } });
}

/** Primeiro acesso da 5ª edição: cria a senha da conta escolhida e já devolve a sessão. Só vale uma vez. */
export function createFirstPassword(playerId: string, newPassword: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/first-access", { method: "POST", body: { playerId, newPassword } });
}
