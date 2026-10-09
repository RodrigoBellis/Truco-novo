/**
 * Redefine a senha de TODOS os jogadores para uma senha temporária e marca must_change_password,
 * obrigando cada um a criar a própria senha no primeiro acesso.
 *
 * DESTRUTIVO: sobrescreve as senhas que os jogadores já tinham escolhido.
 * A conta de admin/superadmin NÃO é afetada.
 *
 * Dois modos, escolhidos por TRUCO_PASSWORD_MODE:
 * - "individual" (padrão, o do lançamento): sorteia uma senha diferente para cada jogador e
 *   grava a lista em senhas-temporarias.local.csv (arquivo ignorado pelo git) para o
 *   organizador entregar a cada um. Ninguém consegue entrar na conta de outro.
 * - "shared" (só para testes, precisa ser pedido): todos recebem TRUCO_DEFAULT_PASSWORD.
 *   Enquanto alguém não troca a senha, quem souber a senha temporária entra na conta dela.
 *
 * Uso: node --import tsx --env-file=.env src/scripts/resetPlayerPasswords.ts
 */
import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";
import { supabaseAdmin } from "../data/supabaseClient.js";

const MODE = process.env.TRUCO_PASSWORD_MODE === "shared" ? "shared" : "individual";
// A senha temporária nunca fica no código: vem de TRUCO_DEFAULT_PASSWORD (backend/.env ou
// variável da sessão) e precisa ter ao menos 6 caracteres, o mínimo do Supabase Auth.
const SHARED_PASSWORD = process.env.TRUCO_DEFAULT_PASSWORD ?? "";
if (MODE === "shared" && SHARED_PASSWORD.length < 6) {
  console.error("No modo shared, defina TRUCO_DEFAULT_PASSWORD com pelo menos 6 caracteres. Sem TRUCO_PASSWORD_MODE o script usa senhas individuais.");
  process.exit(1);
}

const OUTPUT_FILE = "senhas-temporarias.local.csv";
// Sem caracteres que se confundem ao ler em voz alta ou no papel (0/O, 1/l/I).
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function temporaryPassword(): string {
  return Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

async function main(): Promise<void> {
  const { data: profiles, error } = await supabaseAdmin
    .from("truco_profiles")
    .select("truco_id, email, role, truco_player_id")
    .eq("role", "jogador");
  if (error) throw error;
  const { data: players, error: playersError } = await supabaseAdmin.from("truco_players").select("truco_id, name");
  if (playersError) throw playersError;
  const nameOf = (playerId: string | null) => players?.find((player) => player.truco_id === playerId)?.name ?? "?";

  let updated = 0;
  const failures: string[] = [];
  const handout: string[] = ["jogador,senha_temporaria"];

  for (const profile of profiles ?? []) {
    const password = MODE === "individual" ? temporaryPassword() : SHARED_PASSWORD;
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(profile.truco_id, { password });
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
    handout.push(`${nameOf(profile.truco_player_id)},${password}`);
    // A senha nunca vai para o terminal: só para o arquivo local, no modo individual.
    console.log(`${nameOf(profile.truco_player_id)} — senha temporária definida`);
  }

  if (MODE === "individual") {
    writeFileSync(OUTPUT_FILE, handout.join("\n") + "\n", "utf8");
    console.log(`\nSenhas individuais gravadas em ${OUTPUT_FILE}. Entregue a cada jogador e apague o arquivo depois.`);
  }
  console.log(`\n${updated} jogador(es) atualizado(s), modo ${MODE}. Todos precisam criar a própria senha no primeiro acesso.`);
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
