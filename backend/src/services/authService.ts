import type { AuthUser, LoginResponse, UserRole } from "@truco/shared";
import { createLoginClient, supabaseAdmin } from "../data/supabaseClient.js";
import { isRehearsalMode } from "../utils/rehearsalMode.js";
import { rehearsalAuthUser, rehearsalLogin } from "../data/rehearsalAuth.js";
import { rehearsalStore } from "../data/rehearsalStore.js";
import { clearLoginFailures, loginBlocked, recordLoginFailure } from "../utils/loginAttempts.js";

export class AuthError extends Error {}

export async function toAuthUser(authUserId: string): Promise<AuthUser> {
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
export async function login(identifier: { email?: string; playerId?: string }, password: string, origin = "desconhecido"): Promise<LoginResponse> {
  const account = identifier.email?.trim() ? "email:" + identifier.email.trim().toLowerCase() : "player:" + String(identifier.playerId ?? "");
  return limitedLogin(account, origin, MAX_FAILURES_PER_ACCOUNT, () => signIn(identifier, password));
}

async function signIn(identifier: { email?: string; playerId?: string }, password: string): Promise<LoginResponse | null> {
  // Modo ensaio: contas fictícias em memória, sem Supabase Auth.
  if (isRehearsalMode()) return rehearsalLogin(identifier, password);

  const email = identifier.email?.trim()
    ? identifier.email.trim().toLowerCase()
    : await emailForPlayerId(String(identifier.playerId ?? ""));

  const { data, error } = await createLoginClient().auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) return null;

  return {
    user: await toAuthUser(data.user.id),
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

/** Recusa de entrada por excesso de tentativas (a rota responde 429). */
export class LoginBlockedError extends AuthError {}

// Por conta: poucas recusas. Por origem: folgado, porque no dia todos podem estar no mesmo wi-fi.
const MAX_FAILURES_PER_ACCOUNT = 5;
const MAX_FAILURES_ADMIN = 5;
const MAX_FAILURES_PER_ORIGIN = 60;

async function limitedLogin(account: string, origin: string, maxForAccount: number, attempt: () => Promise<LoginResponse | null>): Promise<LoginResponse> {
  const originKey = "origin:" + origin;
  if (loginBlocked([[account, maxForAccount], [originKey, MAX_FAILURES_PER_ORIGIN]])) {
    throw new LoginBlockedError("Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.");
  }
  const session = await attempt();
  if (!session) {
    recordLoginFailure([account, originKey]);
    throw new AuthError("Senha incorreta. Tente novamente.");
  }
  clearLoginFailures(account);
  return session;
}

/**
 * Entrada do administrador só com a senha (decisão de 15/10/2026). A conta administrativa é
 * resolvida aqui no backend — TRUCO_ADMIN_EMAIL, ou a única conta superadmin —, e a senha é
 * conferida pelo Supabase Auth, que guarda só o hash. O e-mail nunca vai para o navegador.
 */
export async function adminLogin(password: string, origin = "desconhecido"): Promise<LoginResponse> {
  return limitedLogin("admin", origin, MAX_FAILURES_ADMIN, async () => {
    const email = await adminEmail();
    const session = await signIn({ email }, password);
    if (session && session.user.role !== "admin" && session.user.role !== "superadmin") return null;
    return session;
  });
}

async function adminEmail(): Promise<string> {
  const configured = process.env.TRUCO_ADMIN_EMAIL?.trim().toLowerCase();
  if (configured) return configured;
  if (isRehearsalMode()) {
    const admin = rehearsalStore().accounts().find((account) => account.role === "superadmin");
    if (!admin) throw new AuthError("Conta do administrador não configurada.");
    return admin.email;
  }
  const { data, error } = await supabaseAdmin.from("truco_profiles").select("email").eq("role", "superadmin").limit(2);
  if (error || !data || data.length !== 1 || !data[0].email) throw new AuthError("Conta do administrador não configurada.");
  return data[0].email;
}

/** Mínimo exigido pela política de senhas do Supabase Auth deste projeto. */
export const MIN_PASSWORD_LENGTH = 6;

export function passwordProblem(newPassword: string): string | null {
  if (newPassword.length < MIN_PASSWORD_LENGTH) return "A senha deve ter pelo menos " + MIN_PASSWORD_LENGTH + " caracteres.";
  if (newPassword !== newPassword.trim()) return "A senha não pode começar nem terminar com espaço.";
  return null;
}

/**
 * Troca a senha da conta autenticada (authUserId vem do token já validado) e encerra a
 * obrigação de troca do primeiro acesso.
 */
export async function changePassword(authUserId: string, newPassword: string, currentPassword?: string): Promise<AuthUser> {
  const problem = passwordProblem(newPassword);
  if (problem) throw new AuthError(problem);

  if (isRehearsalMode()) {
    const current = rehearsalStore().findAccount({ id: authUserId });
    // Fora do primeiro acesso, trocar a senha exige a senha atual (sessão esquecida aberta não basta).
    if (current && !current.mustChangePassword && current.password !== currentPassword) throw new AuthError("A senha atual não confere.");
    rehearsalStore().setAccountPassword(authUserId, newPassword);
    const account = rehearsalStore().findAccount({ id: authUserId });
    if (!account) throw new AuthError("Perfil não encontrado para este usuário.");
    return rehearsalAuthUser(account);
  }

  const { data: profile } = await supabaseAdmin.from("truco_profiles").select("email, must_change_password").eq("truco_id", authUserId).maybeSingle();
  if (!profile) throw new AuthError("Perfil não encontrado para este usuário.");
  if (!profile.must_change_password) {
    // Confere a senha atual num cliente isolado: nunca no supabaseAdmin compartilhado.
    const { error: currentError } = await createLoginClient().auth.signInWithPassword({ email: profile.email, password: String(currentPassword ?? "") });
    if (currentError) throw new AuthError("A senha atual não confere.");
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: newPassword });
  if (updateError) throw new AuthError(updateError.code === "weak_password" ? "Senha fraca demais. Escolha outra com pelo menos " + MIN_PASSWORD_LENGTH + " caracteres." : "Não foi possível salvar a nova senha.");

  const { error: profileError } = await supabaseAdmin
    .from("truco_profiles")
    .update({ must_change_password: false })
    .eq("truco_id", authUserId);
  if (profileError) throw new AuthError("A senha foi trocada, mas não foi possível atualizar o perfil. Avise o administrador.");

  return toAuthUser(authUserId);
}
