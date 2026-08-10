import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias (veja backend/.env.example).");
}

/**
 * Client server-side com a service_role — nunca deve ser exposto ao frontend.
 * service_role ignora RLS, então toda autorização real acontece em requireAuth/requireRole
 * (backend/src/middleware/requireAuth.ts), não aqui.
 */
export const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
