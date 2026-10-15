import type { Json } from "../types/database.js";
import { supabaseAdmin } from "../data/supabaseClient.js";
import { isRehearsalMode } from "../utils/rehearsalMode.js";
import { rehearsalStore } from "../data/rehearsalStore.js";
import type { AuthenticatedUser } from "../middleware/requireAuth.js";
import { withAccountLock } from "../utils/accountLock.js";
import { resetLoginAttempts } from "../utils/loginAttempts.js";

/**
 * Acesso dos jogadores na 5ª edição (decisão de 15/10/2026): senha fixa e permanente para cada
 * um, no padrão "Truco" + nome da carta sem espaços nem acentos (Digão → TrucoDigao). O jogador
 * escolhe a carta, digita a senha e entra; não existe criação nem troca obrigatória de senha.
 * O organizador aceitou que a senha é previsível.
 *
 * Proteções que continuam:
 * - "Redefinir acesso" grava de novo a senha fixa e marca sessions_valid_after: toda sessão
 *   aberta antes disso é recusada pela API.
 * - Limite de tentativas de entrada (utils/loginAttempts).
 * - Nenhuma senha vai para log, auditoria ou resposta da API; o Supabase Auth guarda só o hash.
 */
export class AccessError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 | 429 | 500 | 503, readonly code?: string) {
    super(message);
  }
}

const notInRehearsal = () => new AccessError("A redefinição de acesso não existe no modo ensaio.", 503);

/** Senha fixa da 5ª edição: "Truco" + nome da carta, sem espaços, acentos nem símbolos. */
export function fixedPasswordFor(name: string): string {
  return "Truco" + name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]/g, "");
}

/** E-mail técnico de login (não é exibido nem usado para contato). Mesmo padrão do provisionamento. */
export function loginEmailFor(name: string): string {
  const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${slug}@trucodonovo.com`;
}

/** Só para os testes e o reset da homologação: zera os contadores de tentativas. */
export function resetAccessRateLimits(): void {
  resetLoginAttempts();
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

// ---------- Administrador ----------

export interface PlayerAccessStatus {
  playerId: string;
  hasAccount: boolean;
  setupPending: boolean;
  setupCompletedAt: string | null;
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
 * "Redefinir acesso": grava de novo a senha fixa do jogador e derruba as sessões abertas antes.
 * Jogador oficial ainda sem conta ganha a conta aqui, já com a senha fixa.
 */
async function resetOne(playerId: string, playerName: string): Promise<{ accountId: string; created: boolean }> {
  const { data: profile, error } = await supabaseAdmin.from("truco_profiles").select("truco_id, role").eq("truco_player_id", playerId).maybeSingle();
  if (error) throw new AccessError("Não foi possível consultar o acesso do jogador.", 500);
  if (profile && profile.role !== "jogador") throw new AccessError("O acesso do administrador não é redefinido por esta tela.", 403);
  const now = new Date().toISOString();
  const password = fixedPasswordFor(playerName);
  if (!profile) {
    const email = loginEmailFor(playerName);
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError || !created.user) throw new AccessError(`Não foi possível criar o acesso de ${playerName}.`, 500);
    const { error: insertError } = await supabaseAdmin.from("truco_profiles").insert({
      truco_id: created.user.id, truco_player_id: playerId, email, role: "jogador", must_change_password: false,
      access_setup_required: false, access_setup_completed_at: now, sessions_valid_after: now,
    });
    if (insertError) {
      // Desfaz a conta sem perfil: senão a próxima tentativa esbarra no mesmo e-mail já cadastrado.
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      if (deleteError) console.warn("[acesso] conta sem perfil não removida:", created.user.id);
      throw new AccessError(`Não foi possível gravar o acesso de ${playerName}. Tente de novo.`, 500);
    }
    return { accountId: created.user.id, created: true };
  }
  // Primeiro a senha fixa; depois o corte das sessões abertas antes deste momento.
  const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(profile.truco_id, { password });
  if (passwordError) throw new AccessError(`Não foi possível gravar a senha de ${playerName}. Tente de novo.`, 500);
  const { error: flagError } = await supabaseAdmin.from("truco_profiles")
    .update({ access_setup_required: false, access_setup_completed_at: now, sessions_valid_after: now, must_change_password: false })
    .eq("truco_id", profile.truco_id);
  if (flagError) throw new AccessError(`A senha de ${playerName} foi gravada, mas as sessões antigas não foram encerradas. Tente de novo.`, 500);
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
  const result = await withAccountLock(playerId, () => resetOne(playerId, name));
  await audit(result.created ? "access_created" : "access_reset", actor.id, result.accountId, { playerId, playerName: name });
  return { playerId, playerName: name, accountCreated: result.created };
}

/**
 * Grava a senha fixa de todos os participantes da edição em andamento (os 14) e derruba as
 * sessões abertas antes. Só com o cadeado
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
    const name = await playerName(playerId);
    const result = await withAccountLock(playerId, () => resetOne(playerId, name));
    if (result.created) created += 1;
  }
  await audit("access_restart_all", actor.id, null, { players: playerIds.length, created });
  return { restarted: playerIds.length, created };
}
