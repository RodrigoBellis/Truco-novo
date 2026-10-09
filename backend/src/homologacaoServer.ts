// Entrada do MODO HOMOLOGAÇÃO: a API real, o repositório real e as RPCs reais sobre o
// PostgreSQL LOCAL descartável, com contas e dados fictícios.
// Uso: node backend/scripts/homologacao-local.mjs up
//      npm run dev:homologacao --workspace backend   (porta 3101; não lê backend/.env)
//
// Liga a variável antes de carregar qualquer módulo da aplicação e apaga do processo as chaves
// do Supabase que o terminal por acaso tenha: neste modo nada alcança o banco oficial. O banco
// é conferido (marcador de ambiente, 127.0.0.1, identidade restrita) antes de a API escutar.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.env.TRUCO_HOMOLOGACAO = "1";
process.env.PORT ??= "3101";
delete process.env.TRUCO_REHEARSAL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const envFile = fileURLToPath(new URL("../.env.homologacao", import.meta.url));
if (!process.env.HOMOLOGACAO_DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

const { assertHomologationDatabase } = await import("./data/homologation/pgSupabaseShim.js");
await assertHomologationDatabase();
await import("./server.js");

export {};
