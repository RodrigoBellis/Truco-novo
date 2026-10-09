import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.js";
import { isRehearsalMode } from "../utils/rehearsalMode.js";
import { isHomologationMode } from "../utils/homologationMode.js";

// Modo ensaio: nenhuma chave é lida e nenhum cliente é criado. Qualquer código que ainda
// tente falar com o Supabase nesse modo falha na hora, em vez de alcançar o banco real.
const rehearsal = isRehearsalMode();
// Modo homologação: o cliente é trocado por SQL direto no PostgreSQL local; o driver só é
// carregado nesse modo e nenhuma chave do Supabase é lida.
const homologation = !rehearsal && isHomologationMode();
const homologationClient = homologation ? (await import("./homologation/pgSupabaseShim.js")).createHomologationClient() : null;
const offline = rehearsal || homologation;
const supabaseUrl = offline ? undefined : process.env.SUPABASE_URL;
const serviceRoleKey = offline ? undefined : process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!offline && (!supabaseUrl || !serviceRoleKey)) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias (veja backend/.env.example).");
}

function refuseInRehearsal(): never {
  throw new Error("Modo ensaio: o acesso ao Supabase está desligado.");
}

/**
 * Client server-side com a service_role — nunca deve ser exposto ao frontend.
 * service_role ignora RLS, então toda autorização real acontece em requireAuth/requireRole
 * (backend/src/middleware/requireAuth.ts), não aqui.
 */
export const supabaseAdmin: SupabaseClient<Database> = rehearsal
  ? (new Proxy({}, { get: refuseInRehearsal }) as SupabaseClient<Database>)
  : homologationClient ?? createClient<Database>(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

/** Password sign-in must never replace the server's service-role session.
 * Each login receives an isolated client, including concurrent requests. */
export function createLoginClient() {
  if (rehearsal) refuseInRehearsal();
  // Homologação: a senha é conferida contra as contas fictícias; não há sessão a contaminar.
  if (homologationClient) return homologationClient;
  return createClient<Database>(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
