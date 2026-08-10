import type { UserRole } from "./player.js";

export interface AuthUser {
  /** Id da conta no Supabase Auth (truco_profiles) — não confundir com playerId. */
  id: string;
  /** Id do jogador (truco_players). Admin não tem jogador vinculado. */
  playerId: string | null;
  name: string;
  email: string;
  role: UserRole;
  teamId: string | null;
  mustChangePassword: boolean;
  avatarUrl: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
  /** Necessário para o cliente supabase-js autenticar a conexão de Realtime como o
   *  próprio usuário — sem isso, RLS bloqueia toda a assinatura de mudanças ao vivo. */
  refreshToken: string;
}

export interface ChangePasswordRequest {
  email: string;
  newPassword: string;
}
