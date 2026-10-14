import { randomBytes } from "node:crypto";
import type { LoginResponse } from "@truco/shared";
import type { Json } from "../types/database.js";
import { createLoginClient, supabaseAdmin } from "../data/supabaseClient.js";
import { isRehearsalMode } from "../utils/rehearsalMode.js";
import { rehearsalStore } from "../data/rehearsalStore.js";
import { passwordProblem, toAuthUser } from "./authService.js";
import type { AuthenticatedUser } from "../middleware/requireAuth.js";

/**
 * Acesso dos jogadores na 5ª edição (decisão de 14/10/2026): cada um cria a própria senha na
 * primeira entrada, direto na carta, sem e-mail, SMS ou código. O administrador só reinicia
 * acessos; nunca vê nem guarda senhas.
 *
 * Proteções:
 * - Reiniciar o acesso troca a senha por uma aleatória que ninguém conhece (a antiga deixa de
 *   valer) e marca sessions_valid_after: toda sessão aberta antes disso é recusada pela API.
 * - Criar a senha é uma reivindicação atômica (UPDATE ... WHERE access_setup_required): se duas
 *   pessoas tentarem ao mesmo tempo, só uma grava; a outra recebe "já criou a senha".
 * - Limite de tentativas por jogador e por origem.
 * - Nenhuma senha vai para log ou auditoria; o Supabase Auth guarda só o hash.
 *
 * Limite assumido pelo organizador: sem verificação de identidade, quem escolher a carta de outro
 * jogador antes dele cria a senha no lugar dele. O jogador percebe ("já criou a senha") e o
 * administrador usa "Redefinir acesso"; a auditoria registra quando cada acesso foi criado.
 */
export class AccessError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 | 429 | 500 | 503, readonly code?: string) {
    super(message);
  }
}

const notInRehearsal = () => new AccessError("A criação de senha da 5ª edição não existe no modo ensaio.", 503);

/** Senha que ninguém conhece: ao reiniciar o acesso, a senha anterior deixa de valer. */
export function unknownPassword(): string {
  return randomBytes(32).toString("base64url");
}

/** E-mail técnico de login (não é exibido nem usado para contato). Mesmo padrão do provisionamento. */
export function loginEmailFor(name: string): string {
  const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${slug}@trucodonovo.com`;
}

// ---------- Limite de tentativas (memória do processo; uma instância em produção) ----------

const WINDOW_MS = 10 * 60_000;
const MAX_PER_PLAYER = 5;
// No dia do campeonato todos podem estar no mesmo wi-fi (mesmo IP): o limite por origem é folgado.
const MAX_PER_ORIGIN = 60;
const attempts = new Map<string, number[]>();

function tooMany(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > max;
}

/** Só para os testes: zera os contadores de tentativas. */
export function resetAccessRateLimits(): void {
  attempts.clear();
}

async function currentChampionshipId(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("truco_championships").select("truco_id")
    .eq("status", "em_andamento").order("edition", { ascending: false }).limit(1).maybeSingle();
  return data?.truco_id ?? null;
}

async function audit(action: string, actorId: string | null, entityId: string | null, metadata: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin.from("truco_audit_log").insert({
    truco_championship_id: await currentChampionshipId(), entity: "truco_profiles", entity_id: entityId, action, truco_actor_id: actorId, metadata: metadata as Json,
  });
  if (error) console.warn("[acesso] auditoria não gravada:", error.message);
}

// ---------- Criação da senha pelo jogador ----------

/**
 * Cria a senha da 5ª edição e abre a sessão. Só funciona uma vez por conta (até o administrador
 * redefinir o acesso). `origin` é o IP da requisição, para o limite de tentativas.
 */
export async function createFirstPassword(playerId: string, newPassword: string, origin: string): Promise<LoginResponse> {
  if (isRehearsalMode()) throw notInRehearsal();
  if (tooMany("player:" + playerId, MAX_PER_PLAYER) || tooMany("origin:" + origin, MAX_PER_ORIGIN)) {
    throw new AccessError("Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.", 429, "rate_limited");
  }
  const problem = passwordProblem(newPassword);
  if (problem) throw new AccessError(problem, 400, "weak_password");

  // Reivindicação atômica: só a primeira requisição encontra access_setup_required = true.
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin.from("truco_profiles")
    .update({ access_setup_required: false, access_setup_completed_at: now, sessions_valid_after: now, must_change_password: false })
    .eq("truco_player_id", playerId).eq("role", "jogador").eq("access_setup_required", true)
    .select("truco_id, email");
  if (claimError) throw new AccessError("Não foi possível criar a senha agora. Tente de novo.", 500);
  const profile = claimed?.[0];
  if (!profile) {
    const { data: existing } = await supabaseAdmin.from("truco_profiles").select("truco_id").eq("truco_player_id", playerId).eq("role", "jogador").maybeSingle();
    if (!existing) throw new AccessError("Jogador não encontrado.", 404);
    throw new AccessError("Este jogador já criou a senha. Entre com ela. Se não foi você, avise o administrador.", 409, "already_configured");
  }

  const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(profile.truco_id, { password: newPassword });
  if (passwordError) {
    // Devolve a conta à pendência para o jogador poder tentar de novo.
    await supabaseAdmin.from("truco_profiles").update({ access_setup_required: true, access_setup_completed_at: null }).eq("truco_id", profile.truco_id);
    throw new AccessError(passwordError.code === "weak_password" ? "Senha fraca demais. Escolha outra." : "Não foi possível salvar a senha. Tente de novo.", passwordError.code === "weak_password" ? 400 : 500);
  }
  await audit("access_setup_completed", profile.truco_id, profile.truco_id, { playerId });

  const { data: session, error: loginError } = await createLoginClient().auth.signInWithPassword({ email: profile.email, password: newPassword });
  if (loginError || !session.session) throw new AccessError("Senha criada. Entre com ela agora.", 500, "login_after_setup");
  return { user: await toAuthUser(profile.truco_id), token: session.session.access_token, refreshToken: session.session.refresh_token };
}

// ---------- Administrador ----------

export interface PlayerAccessStatus {
  playerId: string;
  hasAccount: boolean;
  setupPending: boolean;
  setupCompletedAt: string | null;
}

/** Ids dos jogadores que ainda precisam criar a senha (para a tela de entrada). */
export async function setupPendingPlayerIds(): Promise<Set<string>> {
  if (isRehearsalMode()) return new Set();
  const { data } = await supabaseAdmin.from("truco_profiles").select("truco_player_id").eq("role", "jogador").eq("access_setup_required", true);
  return new Set((data ?? []).map((row) => row.truco_player_id));
}

export async function listAccessStatus(): Promise<PlayerAccessStatus[]> {
  if (isRehearsalMode()) {
    return rehearsalStore().accounts().filter((account) => account.role === "jogador")
      .map((account) => ({ playerId: account.playerId, hasAccount: true, setupPending: false, setupCompletedAt: null }));
  }
  const { data, error } = await supabaseAdmin.from("truco_profiles")
    .select("truco_player_id, access_setup_required, access_setup_completed_at").eq("role", "jogador");
  if (error) throw new AccessError("Não foi possível consultar os acessos.", 500);
  return (data ?? []).map((row) => ({ playerId: row.truco_player_id, hasAccount: true, setupPending: row.access_setup_required, setupCompletedAt: row.access_setup_completed_at }));
}

/**
 * "Redefinir acesso": a senha atual deixa de valer, as sessões abertas caem e o jogador volta a
 * "Aguardando criação de senha". Jogador oficial ainda sem conta ganha a conta aqui.
 */
async function resetOne(playerId: string, playerName: string): Promise<{ accountId: string; created: boolean }> {
  const { data: profile, error } = await supabaseAdmin.from("truco_profiles").select("truco_id, role").eq("truco_player_id", playerId).maybeSingle();
  if (error) throw new AccessError("Não foi possível consultar o acesso do jogador.", 500);
  if (profile && profile.role !== "jogador") throw new AccessError("O acesso do administrador não é redefinido por esta tela.", 403);
  const now = new Date().toISOString();
  if (!profile) {
    const email = loginEmailFor(playerName);
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({ email, password: unknownPassword(), email_confirm: true });
    if (createError || !created.user) throw new AccessError(`Não foi possível criar o acesso de ${playerName}.`, 500);
    const { error: insertError } = await supabaseAdmin.from("truco_profiles").insert({
      truco_id: created.user.id, truco_player_id: playerId, email, role: "jogador", must_change_password: false,
      access_setup_required: true, access_setup_completed_at: null, sessions_valid_after: now,
    });
    if (insertError) throw new AccessError(`O acesso de ${playerName} foi criado, mas o perfil não foi gravado. Tente de novo.`, 500);
    return { accountId: created.user.id, created: true };
  }
  // Primeiro a pendência e o corte de sessões; depois a senha desconhecida.
  const { error: flagError } = await supabaseAdmin.from("truco_profiles")
    .update({ access_setup_required: true, access_setup_completed_at: null, sessions_valid_after: now, must_change_password: false })
    .eq("truco_id", profile.truco_id);
  if (flagError) throw new AccessError(`Não foi possível redefinir o acesso de ${playerName}.`, 500);
  const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(profile.truco_id, { password: unknownPassword() });
  if (passwordError) throw new AccessError(`O acesso de ${playerName} foi marcado para nova senha, mas a senha antiga não foi invalidada. Tente de novo.`, 500);
  return { accountId: profile.truco_id, created: false };
}

async function playerName(playerId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from("truco_players").select("name").eq("truco_id", playerId).maybeSingle();
  if (error) throw new AccessError("Não foi possível consultar o jogador.", 500);
  if (!data) throw new AccessError("Jogador não encontrado.", 404);
  return data.name;
}

export async function resetPlayerAccess(actor: AuthenticatedUser, playerId: string): Promise<{ playerId: string; playerName: string; accountCreated: boolean }> {
  if (actor.role !== "admin" && actor.role !== "superadmin") throw new AccessError("Só o administrador redefine acessos.", 403);
  if (isRehearsalMode()) throw notInRehearsal();
  const name = await playerName(playerId);
  const result = await resetOne(playerId, name);
  await audit(result.created ? "access_created" : "access_reset", actor.id, result.accountId, { playerId, playerName: name });
  return { playerId, playerName: name, accountCreated: result.created };
}

/**
 * Reinicia o acesso de todos os participantes da edição em andamento (os 14). Só com o cadeado
 * de resultados fechado: é uma operação de preparação, nunca de dia de jogo.
 */
export async function restartEditionAccess(actor: AuthenticatedUser): Promise<{ restarted: number; created: number }> {
  if (actor.role !== "admin" && actor.role !== "superadmin") throw new AccessError("Só o administrador reinicia acessos.", 403);
  if (isRehearsalMode()) throw notInRehearsal();
  const { data: championship } = await supabaseAdmin.from("truco_championships").select("truco_id, results_locked")
    .eq("status", "em_andamento").order("edition", { ascending: false }).limit(1).maybeSingle();
  if (!championship) throw new AccessError("Nenhuma edição em andamento.", 409);
  if (championship.results_locked !== true) throw new AccessError("Feche o cadeado de resultados antes de reiniciar os acessos.", 409, "results_open");
  const { data: memberships, error } = await supabaseAdmin.from("truco_team_memberships")
    .select("truco_player_1_id, truco_player_2_id").eq("truco_championship_id", championship.truco_id);
  if (error) throw new AccessError("Não foi possível listar os participantes.", 500);
  const playerIds = [...new Set((memberships ?? []).flatMap((row) => [row.truco_player_1_id, row.truco_player_2_id]))];
  let created = 0;
  for (const playerId of playerIds) {
    const result = await resetOne(playerId, await playerName(playerId));
    if (result.created) created += 1;
  }
  await audit("access_restart_all", actor.id, null, { players: playerIds.length, created });
  return { restarted: playerIds.length, created };
}
