/**
 * Redefine a senha de TODOS os jogadores para a senha padrão e marca must_change_password,
 * obrigando cada um a criar uma senha nova no primeiro login.
 *
 * DESTRUTIVO: sobrescreve as senhas que os jogadores já tinham escolhido.
 * A conta de admin/superadmin NÃO é afetada.
 *
 * Uso: node --import tsx --env-file=.env src/scripts/resetPlayerPasswords.ts
 */
import { supabaseAdmin } from "../data/supabaseClient.js";

const DEFAULT_PASSWORD = process.env.TRUCO_DEFAULT_PASSWORD ?? "2026";

async function main(): Promise<void> {
  const { data: profiles, error } = await supabaseAdmin
    .from("truco_profiles")
    .select("truco_id, email, role")
    .eq("role", "jogador");
  if (error) throw error;

  let updated = 0;
  const failures: string[] = [];

  for (const profile of profiles ?? []) {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(profile.truco_id, {
      password: DEFAULT_PASSWORD,
    });
    if (authError) {
      failures.push(`${profile.email}: ${authError.message}`);
      continue;
    }

    const { error: flagError } = await supabaseAdmin
      .from("truco_profiles")
      .update({ must_change_password: true })
      .eq("truco_id", profile.truco_id);
    if (flagError) {
      failures.push(`${profile.email} (flag): ${flagError.message}`);
      continue;
    }

    updated += 1;
    console.log(`${profile.email} — senha redefinida`);
  }

  console.log(`\n${updated} jogador(es) atualizado(s).`);
  if (failures.length > 0) {
    console.log(`${failures.length} falha(s):`);
    for (const failure of failures) console.log(`  - ${failure}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
