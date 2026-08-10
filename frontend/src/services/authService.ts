import type { AuthUser, LoginResponse } from "@truco/shared";
import { apiRequest } from "./api";

/** Identifica o usuário por e-mail (admin) ou por playerId (jogador escolhido na lista). */
export type LoginIdentifier = { email: string } | { playerId: string };

export function login(identifier: LoginIdentifier, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/login", { method: "POST", body: { ...identifier, password } });
}

export function changePassword(email: string, newPassword: string): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>("/auth/change-password", { method: "POST", body: { email, newPassword } });
}
