import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.js";
import { homologationDatabaseUrl } from "../../utils/homologationMode.js";
import { changeFictitiousPassword, signInFictitious, userFromAccessToken } from "./fictitiousAuth.js";

// Cliente do MODO HOMOLOGAÇÃO: o subconjunto do supabase-js que o backend usa, executado em
// SQL direto no PostgreSQL local. Existe para que o repositório real (store.ts), as RPCs e os
// gatilhos sejam exercitados sem PostgREST. Cada chamada é uma instrução em transação
// própria, como uma requisição do PostgREST; a conexão assume o papel service_role, com os
// mesmos privilégios que o backend tem em produção.

// PostgREST devolve bigint como número e datas como texto ISO; o driver, por padrão, não.
pg.types.setTypeParser(20, (value) => Number(value));
// timestamptz chega como "2026-10-09 17:00:00.12-03": o fuso sem minutos precisa virar "-03:00".
pg.types.setTypeParser(1184, (value) => new Date(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).toISOString());
pg.types.setTypeParser(1114, (value) => new Date(value.replace(" ", "T") + "Z").toISOString());

interface ShimError { message: string; code: string; details?: string }
interface ShimResult { data: any; error: ShimError | null; count?: number | null }

let pool: pg.Pool | null = null;
let verified: Promise<void> | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: homologationDatabaseUrl(),
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      options: "-c role=service_role -c statement_timeout=15000 -c lock_timeout=8000",
    });
    // Conexão ociosa derrubada pelo servidor: o pool descarta e abre outra na próxima consulta.
    pool.on("error", () => undefined);
  }
  return pool;
}

/**
 * Confere, antes da primeira instrução, que este é mesmo o banco local de homologação: marcador
 * de ambiente presente, servidor em 127.0.0.1, sem os schemas de plataforma do Supabase e com a
 * identidade restrita esperada. Qualquer divergência impede o uso do cliente.
 */
export function assertHomologationDatabase(): Promise<void> {
  verified ??= (async () => {
    const { rows } = await getPool().query(`
      select session_user::text as login, current_user::text as papel,
        coalesce(host(inet_server_addr()), '') as servidor,
        (select count(*)::int from pg_namespace where nspname in ('storage', 'realtime', 'vault', 'supabase_functions')) as plataforma,
        (select rolsuper or rolbypassrls from pg_roles where rolname = session_user) as login_privilegiado,
        to_regclass('homologacao.ambiente') is not null as marcador`);
    const row = rows[0];
    const marker = row.marcador ? (await getPool().query("select nome from homologacao.ambiente")).rows[0]?.nome : null;
    if (marker !== "truco-homologacao-local" || row.plataforma !== 0 || row.login !== "truco_homologacao_runtime" || row.papel !== "service_role"
      || row.login_privilegiado || !["127.0.0.1", "::1"].includes(row.servidor)) {
      throw new Error("Modo homologação recusado: o banco conectado não é o PostgreSQL local de homologação.");
    }
  })();
  verified.catch(() => { verified = null; });
  return verified;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
function ident(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Identificador não suportado pelo cliente de homologação: ${name}`);
  return `"${name}"`;
}

function toError(error: unknown): ShimError {
  const cause = error as { message?: string; code?: string; detail?: string };
  // Código SQLSTATE tem cinco caracteres; qualquer outra coisa (ECONNREFUSED, timeout do pool) é conexão.
  const code = typeof cause.code === "string" && /^[0-9A-Z]{5}$/.test(cause.code) ? cause.code : "08006";
  return { message: cause.message ?? "erro desconhecido", code, details: cause.detail };
}

async function run(text: string, params: unknown[]): Promise<pg.QueryResult> {
  await assertHomologationDatabase();
  return getPool().query(text, params);
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) { parts.push(current); current = ""; } else current += char;
  }
  if (current.trim()) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

const foreignKeyColumns = new Map<string, string>();
async function foreignKeyColumn(constraint: string): Promise<string> {
  if (!foreignKeyColumns.has(constraint)) {
    const { rows } = await run(
      `select a.attname from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.conname = $1 and c.contype = 'f' and c.connamespace = 'public'::regnamespace`, [constraint]);
    if (rows.length !== 1) throw new Error(`Chave estrangeira desconhecida: ${constraint}`);
    foreignKeyColumns.set(constraint, rows[0].attname);
  }
  return foreignKeyColumns.get(constraint)!;
}

/** Lista de colunas do select, com o embed "alias:tabela!fk(colunas)" de relação para-um. */
async function selectList(columns: string): Promise<string> {
  if (columns.trim() === "*") return "t.*";
  const items: string[] = [];
  for (const part of splitTopLevel(columns)) {
    const embed = /^(\w+):(\w+)!(\w+)\(([^()]*)\)$/.exec(part);
    if (embed) {
      const [, alias, table, constraint, inner] = embed;
      const column = await foreignKeyColumn(constraint);
      const innerList = splitTopLevel(inner).map((name) => `e.${ident(name)}`).join(", ");
      items.push(`(select to_jsonb(x) from (select ${innerList} from public.${ident(table)} e where e.truco_id = t.${ident(column)}) x) as ${ident(alias)}`);
    } else {
      items.push(`t.${ident(part)}`);
    }
  }
  return items.join(", ");
}

const sqlValue = (value: unknown): unknown =>
  value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) ? JSON.stringify(value) : value;

class Query implements PromiseLike<ShimResult> {
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private columns = "*";
  private returning: string | null = null;
  private payload: Record<string, unknown>[] = [];
  private wheres: string[] = [];
  private params: unknown[] = [];
  private orders: string[] = [];
  private rowLimit: number | null = null;
  private mode: "many" | "single" | "maybeSingle" = "many";
  private head = false;
  private counting = false;

  constructor(private readonly table: string) {}

  private bind(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  select(columns = "*", options: { count?: "exact"; head?: boolean } = {}): this {
    if (this.operation === "select") {
      this.columns = columns;
      this.head = options.head === true;
      this.counting = options.count === "exact";
    } else {
      this.returning = columns;
    }
    return this;
  }
  insert(rows: Record<string, unknown> | Record<string, unknown>[]): this {
    this.operation = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Record<string, unknown>): this {
    this.operation = "update";
    this.payload = [patch];
    return this;
  }
  delete(): this {
    this.operation = "delete";
    return this;
  }
  eq(column: string, value: unknown): this {
    this.wheres.push(`t.${ident(column)} = ${this.bind(value)}`);
    return this;
  }
  in(column: string, values: unknown[]): this {
    this.wheres.push(`t.${ident(column)} = any(${this.bind(values)})`);
    return this;
  }
  /** Só o formato usado pelo backend: "coluna.eq.valor,coluna.eq.valor". */
  or(expression: string): this {
    const terms = expression.split(",").map((term) => {
      const match = /^(\w+)\.eq\.(.+)$/.exec(term.trim());
      if (!match) throw new Error(`Filtro or() não suportado pelo cliente de homologação: ${term}`);
      return `t.${ident(match[1])} = ${this.bind(match[2])}`;
    });
    this.wheres.push(`(${terms.join(" or ")})`);
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}): this {
    this.orders.push(`t.${ident(column)} ${options.ascending === false ? "desc" : "asc"}`);
    return this;
  }
  limit(count: number): this {
    this.rowLimit = count;
    return this;
  }
  single(): this {
    this.mode = "single";
    return this;
  }
  maybeSingle(): this {
    this.mode = "maybeSingle";
    return this;
  }
  returns(): this {
    return this;
  }

  private where(): string {
    return this.wheres.length > 0 ? ` where ${this.wheres.join(" and ")}` : "";
  }

  private async build(): Promise<{ text: string; rows: boolean } | null> {
    const target = `public.${ident(this.table)}`;
    const returning = this.returning ? ` returning ${await selectList(this.returning)}` : "";
    if (this.operation === "select") {
      if (this.head) return { text: `select count(*)::int as count from ${target} t${this.where()}`, rows: false };
      const order = this.orders.length > 0 ? ` order by ${this.orders.join(", ")}` : "";
      const limit = this.rowLimit !== null ? ` limit ${Number(this.rowLimit)}` : "";
      return { text: `select ${await selectList(this.columns)} from ${target} t${this.where()}${order}${limit}`, rows: true };
    }
    if (this.operation === "insert") {
      if (this.payload.length === 0) return null;
      const columns = [...new Set(this.payload.flatMap((row) => Object.keys(row).filter((key) => row[key] !== undefined)))];
      const tuples = this.payload.map((row) => `(${columns.map((column) => (row[column] === undefined ? "default" : this.bind(sqlValue(row[column])))).join(", ")})`);
      return { text: `insert into ${target} as t (${columns.map(ident).join(", ")}) values ${tuples.join(", ")}${returning}`, rows: this.returning !== null };
    }
    if (this.operation === "update") {
      const entries = Object.entries(this.payload[0]).filter(([, value]) => value !== undefined);
      if (entries.length === 0) return null;
      // Os valores do SET são vinculados depois dos filtros já registrados; a ordem dos $n é a de criação.
      const assignments = entries.map(([column, value]) => `${ident(column)} = ${this.bind(sqlValue(value))}`);
      return { text: `update ${target} t set ${assignments.join(", ")}${this.where()}${returning}`, rows: this.returning !== null };
    }
    return { text: `delete from ${target} t${this.where()}${returning}`, rows: this.returning !== null };
  }

  private async execute(): Promise<ShimResult> {
    try {
      const statement = await this.build();
      if (!statement) return { data: null, error: null };
      const result = await run(statement.text, this.params);
      if (this.head) return { data: null, error: null, count: result.rows[0].count };
      if (!statement.rows) return { data: null, error: null };
      const count = this.counting ? result.rows.length : undefined;
      if (this.mode === "many") return { data: result.rows, error: null, count };
      if (result.rows.length > 1 || (this.mode === "single" && result.rows.length === 0)) {
        return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
      }
      return { data: result.rows[0] ?? null, error: null, count };
    } catch (error) {
      return { data: null, error: toError(error) };
    }
  }

  // Consulta aguardável como a do supabase-js: o repositório real faz `await query`.
  // oxlint-disable-next-line unicorn/no-thenable
  then<A = ShimResult, B = never>(onfulfilled?: ((value: ShimResult) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

async function rpc(name: string, args: Record<string, unknown> = {}): Promise<ShimResult> {
  try {
    const params: unknown[] = [];
    const named = Object.entries(args).map(([key, value]) => {
      // Vetor de objetos ou objeto simples é jsonb; vetor de textos continua vetor do PostgreSQL.
      const json = value !== null && typeof value === "object" && (!Array.isArray(value) || value.length === 0 || value.some((item) => item !== null && typeof item === "object"));
      params.push(json ? JSON.stringify(value) : value);
      return `${ident(key)} => $${params.length}`;
    });
    const result = await run(`select public.${ident(name)}(${named.join(", ")}) as result`, params);
    return { data: result.rows[0]?.result ?? null, error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
}

const refuseStorage = (): never => {
  throw new Error("Modo homologação: o Storage do Supabase não existe aqui.");
};

/** Substituto de supabaseAdmin no modo homologação. */
export function createHomologationClient(): SupabaseClient<Database> {
  const client = {
    from: (table: string) => new Query(table),
    rpc,
    auth: {
      getUser: async (token: string) => {
        const user = userFromAccessToken(token);
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "invalid JWT", code: "bad_jwt" } };
      },
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async (credentials: { email: string; password: string }) => {
        const { rows } = await run("select truco_id from public.truco_profiles where lower(email) = lower($1)", [credentials.email]);
        const session = rows.length === 1 ? signInFictitious({ id: rows[0].truco_id, email: credentials.email }, credentials.password) : null;
        return session
          ? { data: { user: session.user, session }, error: null }
          : { data: { user: null, session: null }, error: { message: "Invalid login credentials", code: "invalid_credentials" } };
      },
      admin: {
        updateUserById: async (id: string, attributes: { password?: string }) => {
          if (attributes.password !== undefined && attributes.password.length < 6) return { data: { user: null }, error: { message: "Password should be at least 6 characters.", code: "weak_password" } };
          if (attributes.password !== undefined) changeFictitiousPassword(id, attributes.password);
          return { data: { user: { id } }, error: null };
        },
      },
    },
    get storage(): never { return refuseStorage(); },
  };
  return client as unknown as SupabaseClient<Database>;
}

/** SQL direto para as rotas de apoio da homologação (reset, estado e leituras do navegador). */
export function homologationQuery(text: string, params: unknown[] = []): Promise<pg.QueryResult> {
  return run(text, params);
}

/** Executa leituras com o papel e a identidade que o navegador teria no Supabase (RLS real). */
export async function homologationQueryAsBrowser(userId: string | null, text: string, params: unknown[] = []): Promise<pg.QueryResult> {
  await assertHomologationDatabase();
  const connection = await getPool().connect();
  try {
    await connection.query("begin transaction read only");
    await connection.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await connection.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    const result = await connection.query(text, params);
    await connection.query("commit");
    return result;
  } catch (error) {
    await connection.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export async function closeHomologationPool(): Promise<void> {
  const current = pool;
  pool = null;
  verified = null;
  await current?.end();
}
