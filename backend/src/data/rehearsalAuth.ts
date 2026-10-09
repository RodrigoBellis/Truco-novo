import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthUser, LoginResponse } from "@truco/shared";
import { rehearsalStore, type RehearsalAccount } from "./rehearsalStore.js";

// Autenticação do MODO ENSAIO. Emite um JWT próprio (HS256, segredo sorteado a cada subida do
// processo) no mesmo formato de sessão que o frontend espera do Supabase Auth: access_token
// com `sub` e `exp`, mais um refresh_token. Não existe fora do modo ensaio e não vale em
// nenhum outro ambiente: o segredo nunca sai deste processo.

const secret = randomBytes(32);
const ACCESS_TOKEN_SECONDS = 12 * 60 * 60;

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (text: string) => createHmac("sha256", secret).update(text).digest("base64url");
const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function issueRehearsalSession(account: RehearsalAccount) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    iss: "truco-ensaio", sub: account.id, aud: "authenticated", role: "authenticated", email: account.email,
    iat: now, exp: now + ACCESS_TOKEN_SECONDS, session_id: account.id,
  })}`;
  const refreshBody = `ensaio-refresh.${Buffer.from(account.id).toString("base64url")}`;
  return {
    token: `${body}.${sign(body)}`,
    refreshToken: `${refreshBody}.${sign(refreshBody)}`,
    expiresIn: ACCESS_TOKEN_SECONDS,
    expiresAt: now + ACCESS_TOKEN_SECONDS,
  };
}

/** Conta dona de um access token válido e não expirado; null para qualquer outra coisa. */
export function accountFromAccessToken(token: string): RehearsalAccount | null {
  const [header, payload, signature, ...rest] = token.split(".");
  if (!header || !payload || !signature || rest.length > 0 || !sameText(signature, sign(`${header}.${payload}`))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: string; exp?: number };
    if (typeof claims.sub !== "string" || typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000) return null;
    return rehearsalStore().findAccount({ id: claims.sub }) ?? null;
  } catch {
    return null;
  }
}

export function accountFromRefreshToken(refreshToken: string): RehearsalAccount | null {
  const [prefix, encodedId, signature, ...rest] = refreshToken.split(".");
  if (prefix !== "ensaio-refresh" || !encodedId || !signature || rest.length > 0 || !sameText(signature, sign(`${prefix}.${encodedId}`))) return null;
  return rehearsalStore().findAccount({ id: Buffer.from(encodedId, "base64url").toString() }) ?? null;
}

export async function rehearsalAuthUser(account: RehearsalAccount): Promise<AuthUser> {
  const player = (await rehearsalStore().listPlayers()).find((item) => item.id === account.playerId);
  return {
    id: account.id,
    playerId: account.playerId,
    name: player?.name ?? "—",
    email: account.email,
    role: account.role,
    teamId: player?.teamId ?? null,
    mustChangePassword: account.mustChangePassword,
    avatarUrl: player?.avatarUrl ?? null,
  };
}

/** Login do ensaio: jogador (playerId ou e-mail fictício) + senha da conta fictícia. */
export async function rehearsalLogin(identifier: { email?: string; playerId?: string }, password: string): Promise<LoginResponse | null> {
  const account = rehearsalStore().findAccount(identifier.email?.trim() ? { email: identifier.email.trim().toLowerCase() } : { playerId: String(identifier.playerId ?? "") });
  if (!account || account.password !== password) return null;
  const session = issueRehearsalSession(account);
  return { user: await rehearsalAuthUser(account), token: session.token, refreshToken: session.refreshToken };
}

/** Usuário no formato de GET /auth/v1/user do Supabase, para o supabase-js do navegador. */
export function supabaseUserPayload(account: RehearsalAccount) {
  return { id: account.id, aud: "authenticated", role: "authenticated", email: account.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
}
