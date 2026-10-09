/**
 * Modo homologação: a API real, com o repositório real (TrucoRepository) e as RPCs reais, sobre
 * um PostgreSQL LOCAL descartável (backend/scripts/homologacao-local.mjs) com dados fictícios.
 * Não existe cliente Supabase neste modo e as contas são fictícias (sem Supabase Auth).
 *
 * Só liga com TRUCO_HOMOLOGACAO=1 explícito e recusa subir se qualquer condição de isolamento
 * falhar: produção, credenciais do Supabase no processo, ou banco fora de 127.0.0.1.
 */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function isHomologationMode(): boolean {
  if (process.env.TRUCO_HOMOLOGACAO !== "1") return false;
  if (process.env.NODE_ENV === "production") {
    throw new Error("TRUCO_HOMOLOGACAO=1 não é permitido com NODE_ENV=production: a homologação usa contas e dados fictícios.");
  }
  if (process.env.TRUCO_REHEARSAL === "1") {
    throw new Error("TRUCO_HOMOLOGACAO=1 e TRUCO_REHEARSAL=1 não podem ser ligados juntos.");
  }
  if (process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Modo homologação recusado: há credenciais do Supabase neste processo. A homologação não pode alcançar o banco oficial.");
  }
  homologationDatabaseUrl();
  return true;
}

/** URL do banco de homologação; recusa qualquer servidor que não seja a própria máquina. */
export function homologationDatabaseUrl(): string {
  const raw = process.env.HOMOLOGACAO_DATABASE_URL;
  if (!raw) throw new Error("HOMOLOGACAO_DATABASE_URL ausente. Rode: node backend/scripts/homologacao-local.mjs up");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("HOMOLOGACAO_DATABASE_URL inválida.");
  }
  if (!/^postgres(ql)?:$/.test(url.protocol) || !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error("Modo homologação recusado: o banco de homologação precisa estar em 127.0.0.1.");
  }
  return raw;
}
