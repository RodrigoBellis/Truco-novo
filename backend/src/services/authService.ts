import type { AuthUser, LoginResponse, UserRole } from "@truco/shared";
import { supabaseAdmin } from "../data/supabaseClient.js";

export class AuthError extends Error {}

async function toAuthUser(authUserId: string): Promise<AuthUser> {
  const { data: profile, error } = await supabaseAdmin
    .from("truco_profiles")
    .select("truco_id, truco_player_id, email, role, must_change_password")
    .eq("truco_id", authUserId)
    .maybeSingle();
  if (error || !profile) throw new AuthError("Perfil não encontrado para este usuário.");

  const { data: player } = await supabaseAdmin
    .from("truco_players")
    .select("name, avatar_url")
    .eq("truco_id", profile.truco_player_id)
    .maybeSingle();
  const { data: championship } = await supabaseAdmin.from("truco_championships").select("truco_id")
    .eq("status", "em_andamento").order("edition", { ascending: false }).limit(1).maybeSingle();
  const { data: member } = championship ? await supabaseAdmin
    .from("truco_team_memberships")
    .select("truco_team_id")
    .eq("truco_championship_id", championship.truco_id)
    .or(`truco_player_1_id.eq.${profile.truco_player_id},truco_player_2_id.eq.${profile.truco_player_id}`)
    .maybeSingle() : { data: null };

  return {
    id: profile.truco_id,
    playerId: profile.truco_player_id ?? null,
    name: player?.name ?? "—",
    email: profile.email,
    role: profile.role as UserRole,
    teamId: member?.truco_team_id ?? null,
    mustChangePassword: profile.must_change_password,
    avatarUrl: player?.avatar_url ?? null,
  };
}

/** Resolve o e-mail de login a partir do id do jogador, sem expor o e-mail publicamente. */
async function emailForPlayerId(playerId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("truco_profiles")
    .select("email")
    .eq("truco_player_id", playerId)
    .maybeSingle();
  if (error || !data?.email) throw new AuthError("Jogador não encontrado.");
  return data.email;
}

/** Login via Supabase Auth. O frontend também pode logar direto via supabase-js — esta rota
 * existe para clientes que preferem passar pelo backend.
 *
 * Aceita `playerId` ou `email`. A tela de login usa playerId, porque a listagem pública
 * de jogadores (/players/roster) não devolve e-mails. */
export async function login(identifier: { email?: string; playerId?: string }, password: string): Promise<LoginResponse> {
  const email = identifier.email?.trim()
    ? identifier.email.trim().toLowerCase()
    : await emailForPlayerId(String(identifier.playerId ?? ""));

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new AuthError("Senha incorreta. Tente novamente.");
  }

  return {
    user: await toAuthUser(data.user.id),
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

async function findAuthUserByEmail(email: string) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new AuthError(error.message);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

export async function changePassword(email: string, newPassword: string): Promise<AuthUser> {
  if (newPassword.trim().length < 4) {
    throw new AuthError("A senha deve ter pelo menos 4 caracteres.");
  }

  const authUser = await findAuthUserByEmail(email.trim().toLowerCase());
  if (!authUser) throw new AuthError("Usuário não encontrado.");

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password: newPassword.trim() });
  if (updateError) throw new AuthError(updateError.message);

  const { error: profileError } = await supabaseAdmin
    .from("truco_profiles")
    .update({ must_change_password: false })
    .eq("truco_id", authUser.id);
  if (profileError) throw new AuthError(profileError.message);

  return toAuthUser(authUser.id);
}
