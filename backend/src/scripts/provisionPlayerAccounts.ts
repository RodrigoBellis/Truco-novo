/**
 * Provisiona contas de acesso (Supabase Auth + truco_profiles) para jogadores que ainda não têm login.
 * Idempotente: pode ser rodado várias vezes sem duplicar usuários nem sobrescrever senhas já trocadas.
 *
 * Uso: node --import tsx src/scripts/provisionPlayerAccounts.ts
 */
import type { UserRole } from "@truco/shared";
import { supabaseAdmin } from "../data/supabaseClient.js";

const DEFAULT_PASSWORD = process.env.TRUCO_DEFAULT_PASSWORD ?? "2026";

interface PlayerToProvision {
  truco_id: string;
  name: string;
  email: string;
  role: UserRole;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function findExistingAuthUserByEmail(email: string) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function provisionOne(player: PlayerToProvision): Promise<"created" | "linked" | "skipped"> {
  const { data: existingProfile } = await supabaseAdmin
    .from("truco_profiles")
    .select("truco_id")
    .eq("truco_player_id", player.truco_id)
    .maybeSingle();

  if (existingProfile) return "skipped";

  let authUserId: string;
  const existingAuthUser = await findExistingAuthUserByEmail(player.email);

  if (existingAuthUser) {
    authUserId = existingAuthUser.id;
  } else {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: player.email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { name: player.name },
    });
    if (createError || !created.user) {
      throw createError ?? new Error(`Falha ao criar usuário para ${player.email}`);
    }
    authUserId = created.user.id;
  }

  const { error: upsertError } = await supabaseAdmin.from("truco_profiles").upsert(
    {
      truco_id: authUserId,
      truco_player_id: player.truco_id,
      email: player.email,
      role: player.role,
      must_change_password: true,
    },
    { onConflict: "truco_id" },
  );
  if (upsertError) throw upsertError;

  return existingAuthUser ? "linked" : "created";
}

async function main(): Promise<void> {
  const { data: players, error } = await supabaseAdmin.from("truco_players").select("truco_id, name");
  if (error) throw error;

  const results = { created: 0, linked: 0, skipped: 0 };

  for (const player of players ?? []) {
    // O frontend (LoginPage) tem o e-mail do admin fixo como "admin@trucodonovo.com" —
    // mantemos esse valor exato em vez do padrão de slug, para não quebrar o login já existente.
    const email = player.name === "Administrador" ? "admin@trucodonovo.com" : `${slugify(player.name)}@trucodonovo.com`;
    const role: UserRole = player.name === "Administrador" ? "superadmin" : "jogador";
    const outcome = await provisionOne({ truco_id: player.truco_id, name: player.name, email, role });
    results[outcome] += 1;
    console.log(`${player.name} <${email}> — ${outcome}`);
  }

  console.log("\nResumo:", results);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
