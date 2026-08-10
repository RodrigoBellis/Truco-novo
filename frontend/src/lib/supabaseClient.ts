import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY são obrigatórias (veja frontend/.env.example).",
  );
}

/** Client público do frontend — usa a chave publishable/anon, nunca a service_role. */
export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
