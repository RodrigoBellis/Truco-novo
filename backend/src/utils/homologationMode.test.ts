import test from "node:test";
import assert from "node:assert/strict";
import { isHomologationMode } from "./homologationMode.js";
import { isRehearsalMode } from "./rehearsalMode.js";

const KEYS = ["TRUCO_HOMOLOGACAO", "TRUCO_REHEARSAL", "NODE_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HOMOLOGACAO_DATABASE_URL"] as const;

function withEnv(values: Partial<Record<(typeof KEYS)[number], string>>, run: () => void): void {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of KEYS) delete process.env[key];
    Object.assign(process.env, values);
    run();
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
}

const LOCAL = "postgresql://truco_homologacao_runtime:senha-ficticia@127.0.0.1:55450/truco_homologacao";

test("modo homologação exige opt-in explícito", () => {
  withEnv({ HOMOLOGACAO_DATABASE_URL: LOCAL }, () => assert.equal(isHomologationMode(), false));
  withEnv({ TRUCO_HOMOLOGACAO: "1", HOMOLOGACAO_DATABASE_URL: LOCAL }, () => assert.equal(isHomologationMode(), true));
});

test("modo homologação é recusado em produção", () => {
  withEnv({ TRUCO_HOMOLOGACAO: "1", NODE_ENV: "production", HOMOLOGACAO_DATABASE_URL: LOCAL }, () => assert.throws(isHomologationMode, /production/));
});

test("modo homologação é recusado com credenciais do Supabase no processo", () => {
  withEnv({ TRUCO_HOMOLOGACAO: "1", SUPABASE_SERVICE_ROLE_KEY: "chave-de-teste", HOMOLOGACAO_DATABASE_URL: LOCAL }, () => assert.throws(isHomologationMode, /credenciais do Supabase/));
  withEnv({ TRUCO_HOMOLOGACAO: "1", SUPABASE_URL: "https://exemplo.supabase.co", HOMOLOGACAO_DATABASE_URL: LOCAL }, () => assert.throws(isHomologationMode, /credenciais do Supabase/));
});

test("modo homologação só aceita banco em 127.0.0.1", () => {
  for (const url of ["postgresql://u:p@db.exemplo.supabase.co:5432/postgres", "postgresql://u:p@aws-0-us-east-2.pooler.supabase.com:6543/postgres", "postgresql://u:p@192.168.0.10:5432/x", "https://127.0.0.1/x", "nada"]) {
    withEnv({ TRUCO_HOMOLOGACAO: "1", HOMOLOGACAO_DATABASE_URL: url }, () => assert.throws(isHomologationMode, /127\.0\.0\.1|inválida/));
  }
  withEnv({ TRUCO_HOMOLOGACAO: "1" }, () => assert.throws(isHomologationMode, /ausente/));
});

test("ensaio e homologação não ligam juntos, e o ensaio recusa a chave de serviço", () => {
  withEnv({ TRUCO_HOMOLOGACAO: "1", TRUCO_REHEARSAL: "1", HOMOLOGACAO_DATABASE_URL: LOCAL }, () => assert.throws(isHomologationMode, /juntos/));
  withEnv({ TRUCO_REHEARSAL: "1", SUPABASE_SERVICE_ROLE_KEY: "chave-de-teste" }, () => assert.throws(isRehearsalMode, /chave de serviço/));
  withEnv({ TRUCO_REHEARSAL: "1" }, () => assert.equal(isRehearsalMode(), true));
});

test("TRUST_PROXY: sem a variável o IP vem da conexão; com 1, do X-Forwarded-For do proxy imediato", async () => {
  const { default: express } = await import("express");
  const ipOf = async (trust: string | undefined, forwarded: string) => {
    const app = express();
    const value = Number(trust ?? 0);
    if (Number.isInteger(value) && value > 0) app.set("trust proxy", value);
    app.get("/ip", (req, res) => { res.json({ ip: req.ip }); });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const port = (server.address() as { port: number }).port;
    const reply = await fetch(`http://127.0.0.1:${port}/ip`, { headers: { "X-Forwarded-For": forwarded } }).then((r) => r.json()) as { ip: string };
    server.close();
    return reply.ip;
  };
  assert.match(await ipOf(undefined, "203.0.113.9"), /127\.0\.0\.1/, "sem proxy confiável, o cabeçalho é ignorado");
  assert.equal(await ipOf("1", "203.0.113.9"), "203.0.113.9");
  // Forjar uma cadeia não adianta: só o último salto (o adicionado pelo Nginx) é aceito.
  assert.equal(await ipOf("1", "1.2.3.4, 203.0.113.9"), "203.0.113.9");
});
