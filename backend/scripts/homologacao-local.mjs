// Homologação LOCAL do Truco do Novo: um PostgreSQL descartável em 127.0.0.1, com o schema
// public.truco_* copiado do catálogo real e as migrations pendentes aplicadas sem alteração.
//
//   node backend/scripts/homologacao-local.mjs up      cria (se preciso), sobe e prepara o banco
//   node backend/scripts/homologacao-local.mjs down    encerra o servidor (os dados ficam)
//   node backend/scripts/homologacao-local.mjs destroy encerra e apaga o cluster
//   node backend/scripts/homologacao-local.mjs status
//   node backend/scripts/homologacao-local.mjs psql "select 1"
//
// Não lê .env, não usa chave nem URL do Supabase, não instala nada: usa os binários do
// PostgreSQL já instalados na máquina. A senha do papel do backend é sorteada aqui e fica só
// em backend/.env.homologacao (fora do git).
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 55450;
const HOST = "127.0.0.1";
const DATABASE = "truco_homologacao";
const RUNTIME_ROLE = "truco_homologacao_runtime";
const dataDir = join(root, "test-results", "homologacao-pg");
const envFile = join(root, "backend", ".env.homologacao");
const MIGRATIONS = [
  "202610070001_edition_six_teams_per_group.sql",
  "202610070002_results_lock.sql",
  "202610090001_knockout_uniqueness.sql",
  "202610090002_transactional_progression.sql",
];

function findBin() {
  const candidates = [process.env.PG_BIN, ...["18", "17", "16", "15"].map((version) => `C:/Program Files/PostgreSQL/${version}/bin`)].filter(Boolean);
  const found = candidates.find((dir) => existsSync(join(dir, process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl")));
  if (!found) throw new Error("Binários do PostgreSQL não encontrados. Defina PG_BIN com a pasta bin (nada é instalado por este script).");
  return found;
}
const bin = findBin();
const tool = (name) => join(bin, process.platform === "win32" ? `${name}.exe` : name);
const baseEnv = { ...process.env, PGPASSWORD: "", PGCLIENTENCODING: "UTF8" };

function run(name, args, options = {}) {
  return execFileSync(tool(name), args, { env: baseEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
}
function psql(args, database = DATABASE) {
  return run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", HOST, "-p", String(PORT), "-U", "postgres", "-d", database, ...args]);
}
function running() {
  return spawnSync(tool("pg_isready"), ["-h", HOST, "-p", String(PORT)], { env: baseEnv }).status === 0;
}
function start() {
  if (running()) return;
  // Só escuta em 127.0.0.1; autenticação por senha para o papel do backend, confiança local para o dono.
  run("pg_ctl", ["-D", dataDir, "-w", "-o", `-p ${PORT} -c listen_addresses=${HOST} -c max_connections=30`, "-l", join(dataDir, "servidor.log"), "start"], { stdio: "ignore" });
}

function up() {
  const fresh = !existsSync(join(dataDir, "PG_VERSION"));
  if (fresh) {
    mkdirSync(dirname(dataDir), { recursive: true });
    run("initdb", ["-D", dataDir, "-U", "postgres", "-E", "UTF8", "--locale=C", "--auth-local=trust", "--auth-host=scram-sha-256"]);
    // O dono (postgres) entra sem senha só por 127.0.0.1; os demais papéis exigem senha.
    const hba = join(dataDir, "pg_hba.conf");
    writeFileSync(hba, `host all postgres 127.0.0.1/32 trust\nhost all all 127.0.0.1/32 scram-sha-256\n`);
  }
  start();
  if (fresh) {
    psql(["-c", `create database ${DATABASE}`], "postgres");
    for (const file of ["00_supabase_stubs.sql", "01_schema_truco_remoto.sql"]) {
      psql(["-f", join(root, "supabase", "homologacao", file)]);
      console.log(`aplicado: supabase/homologacao/${file}`);
    }
    const available = new Set(readdirSync(join(root, "supabase", "migrations")));
    for (const file of MIGRATIONS) {
      if (!available.has(file)) throw new Error(`Migration ausente: ${file}`);
      psql(["-f", join(root, "supabase", "migrations", file)]);
      console.log(`aplicada sem alteração: supabase/migrations/${file}`);
    }
    psql(["-f", join(root, "supabase", "homologacao", "02_seed_ficticio.sql")]);
    psql(["-c", "select homologacao.reset()"]);
    console.log("seed fictício aplicado");
    const password = randomBytes(24).toString("base64url");
    psql(["-c", `alter role ${RUNTIME_ROLE} password '${password}'`]);
    writeFileSync(envFile, [
      "# Gerado por backend/scripts/homologacao-local.mjs. Banco LOCAL descartável; não versionar.",
      `HOMOLOGACAO_DATABASE_URL=postgresql://${RUNTIME_ROLE}:${password}@${HOST}:${PORT}/${DATABASE}`,
      "",
    ].join("\n"));
    console.log("credencial do backend gravada em backend/.env.homologacao (não exibida)");
  }
  status();
}

function status() {
  if (!existsSync(join(dataDir, "PG_VERSION"))) return console.log("homologação local: cluster não criado");
  if (!running()) return console.log("homologação local: cluster criado, servidor parado");
  const out = psql(["-At", "-c", `select 'postgres ' || current_setting('server_version') || ' em ${HOST}:${PORT}; tabelas truco: ' || (select count(*) from pg_tables where schemaname = 'public' and tablename like 'truco_%') || '; jogos: ' || (select count(*) from public.truco_matches) || '; fase: ' || (select current_phase from public.truco_championships where status = 'em_andamento')`]);
  console.log(`homologação local: ${out.trim()}`);
}

function down() {
  if (existsSync(join(dataDir, "PG_VERSION")) && running()) run("pg_ctl", ["-D", dataDir, "-w", "-m", "fast", "stop"], { stdio: "ignore" });
  console.log("homologação local: servidor parado");
}

const command = process.argv[2] ?? "status";
if (command === "up") up();
else if (command === "down") down();
else if (command === "destroy") { down(); rmSync(dataDir, { recursive: true, force: true }); rmSync(envFile, { force: true }); console.log("cluster e credencial apagados"); }
else if (command === "status") status();
else if (command === "psql") process.stdout.write(psql(["-c", process.argv[3] ?? "select 1"]));
else { console.error("Uso: up | down | destroy | status | psql \"<sql>\""); process.exit(1); }
