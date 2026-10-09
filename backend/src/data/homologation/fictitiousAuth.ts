import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Autenticação FICTÍCIA do modo homologação. Não cria, lê nem altera contas no Supabase Auth:
// as identidades são as linhas fictícias de truco_profiles do banco local, todas com a mesma
// senha de ensaio, e o token é um JWT assinado com um segredo sorteado a cada subida do
// processo. Um token daqui não vale em nenhum outro ambiente.

/** Senha única das contas fictícias (a mesma do modo ensaio em memória, para os mesmos testes). */
export const FICTITIOUS_PASSWORD = "ensaio-2026";
const ACCESS_TOKEN_SECONDS = 12 * 60 * 60;

const secret = randomBytes(32);
const passwords = new Map<string, string>();

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (text: string) => createHmac("sha256", secret).update(text).digest("base64url");
const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export interface FictitiousUser { id: string; email: string }

const userPayload = (user: FictitiousUser) => ({ id: user.id, aud: "authenticated", role: "authenticated", email: user.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });

export function issueFictitiousSession(user: FictitiousUser) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    iss: "truco-homologacao", sub: user.id, aud: "authenticated", role: "authenticated", email: user.email,
    iat: now, exp: now + ACCESS_TOKEN_SECONDS, session_id: user.id,
  })}`;
  const refreshBody = `homologacao-refresh.${encode(user)}`;
  return {
    access_token: `${body}.${sign(body)}`,
    refresh_token: `${refreshBody}.${sign(refreshBody)}`,
    token_type: "bearer",
    expires_in: ACCESS_TOKEN_SECONDS,
    expires_at: now + ACCESS_TOKEN_SECONDS,
    user: userPayload(user),
  };
}

export function signInFictitious(user: FictitiousUser, password: string) {
  return (passwords.get(user.id) ?? FICTITIOUS_PASSWORD) === password ? issueFictitiousSession(user) : null;
}

export function changeFictitiousPassword(userId: string, password: string): void {
  passwords.set(userId, password);
}

/** Volta todas as contas à senha de ensaio (usado pelo reset da homologação). */
export function resetFictitiousPasswords(): void {
  passwords.clear();
}

/** Dono de um access token válido e não expirado; null para qualquer outra coisa. */
export function userFromAccessToken(token: string): ReturnType<typeof userPayload> | null {
  const [header, payload, signature, ...rest] = token.split(".");
  if (!header || !payload || !signature || rest.length > 0 || !sameText(signature, sign(`${header}.${payload}`))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: string; exp?: number; email?: string };
    if (typeof claims.sub !== "string" || typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000) return null;
    return userPayload({ id: claims.sub, email: claims.email ?? "" });
  } catch {
    return null;
  }
}

export function userFromRefreshToken(refreshToken: string): FictitiousUser | null {
  const [prefix, encoded, signature, ...rest] = refreshToken.split(".");
  if (prefix !== "homologacao-refresh" || !encoded || !signature || rest.length > 0 || !sameText(signature, sign(`${prefix}.${encoded}`))) return null;
  try {
    const user = JSON.parse(Buffer.from(encoded, "base64url").toString()) as FictitiousUser;
    return typeof user.id === "string" && typeof user.email === "string" ? user : null;
  } catch {
    return null;
  }
}
