import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@truco/shared";
import { supabaseAdmin } from "../data/supabaseClient.js";
import { isRehearsalMode } from "../utils/rehearsalMode.js";
import { accountFromAccessToken } from "../data/rehearsalAuth.js";

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  playerId: string;
  /** Momento do login com senha (segundos), para revalidar a sessão dentro das gravações. */
  authTime?: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

/**
 * Valida o JWT do Supabase enviado pelo frontend e carrega o papel atual direto de
 * truco_profiles (fonte de verdade — não confia no payload do token, que pode estar
 * desatualizado). O backend usa service_role, que ignora RLS, então essa checagem é a
 * autorização real, não apenas uma cortesia de UI.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ message: "Sessão não encontrada. Faça login novamente." });
    return;
  }

  // Modo ensaio: o token é o emitido pelo login de ensaio; nada é consultado no Supabase.
  if (isRehearsalMode()) {
    const account = accountFromAccessToken(token);
    if (!account) {
      res.status(401).json({ message: "Sessão inválida ou expirada." });
      return;
    }
    if (account.mustChangePassword && !req.originalUrl.split("?")[0].endsWith("/auth/change-password")) {
      res.status(403).json({ message: "Crie sua senha antes de continuar.", code: "password_change_required" });
      return;
    }
    req.authUser = { id: account.id, role: account.role, playerId: account.playerId };
    next();
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ message: "Sessão inválida ou expirada." });
    return;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("truco_profiles")
    .select("truco_id, truco_player_id, role, must_change_password, access_setup_required, sessions_valid_after")
    .eq("truco_id", data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    res.status(403).json({ message: "Perfil não encontrado para este usuário." });
    return;
  }

  // Acesso reiniciado: a conta ainda não criou a senha desta edição. Nenhuma sessão vale.
  if (profile.access_setup_required) {
    res.status(401).json({ message: "Crie sua senha para a 5ª Edição: escolha sua carta na tela de entrada.", code: "access_setup_required" });
    return;
  }
  // Sessões abertas antes do reinício do acesso (ou de outra criação de senha) não valem mais.
  if (sessionPredates(token, profile.sessions_valid_after)) {
    res.status(401).json({ message: "Sua sessão expirou. Entre novamente com sua senha.", code: "session_revoked" });
    return;
  }

  // Primeiro acesso: com a senha temporária a conta só pode fazer uma coisa — trocar a senha.
  // A tela já impede o resto; esta trava vale para quem chamar a API direto.
  if (profile.must_change_password && !req.originalUrl.split("?")[0].endsWith("/auth/change-password")) {
    res.status(403).json({ message: "Crie sua senha antes de continuar.", code: "password_change_required" });
    return;
  }

  req.authUser = { id: profile.truco_id, role: profile.role, playerId: profile.truco_player_id, authTime: authTimeOf(token) };
  next();
}

/**
 * Horário em que a sessão foi autenticada, em segundos. O Supabase grava em `amr` o momento do
 * login com senha, e esse valor se mantém quando a sessão é renovada; `iat` é só o fallback.
 * O token já foi validado por auth.getUser antes desta leitura.
 */
export function authTimeOf(token: string): number | null {
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as { amr?: Array<{ timestamp?: number }>; iat?: number };
    const stamps = (claims.amr ?? []).map((entry) => entry.timestamp).filter((value): value is number => typeof value === "number");
    return stamps.length > 0 ? Math.min(...stamps) : typeof claims.iat === "number" ? claims.iat : null;
  } catch {
    return null;
  }
}

/** Sessão autenticada antes de `validAfter` (com 1 s de tolerância de relógio). Sem horário legível, é recusada. */
export function sessionPredates(token: string, validAfter: string | null | undefined): boolean {
  return authTimePredates(authTimeOf(token), validAfter);
}

export function authTimePredates(authTime: number | null | undefined, validAfter: string | null | undefined): boolean {
  if (!validAfter) return false;
  return authTime == null || authTime * 1000 < new Date(validAfter).getTime() - 1000;
}

/** Deve vir depois de requireAuth. Bloqueia quem não tem um dos papéis permitidos. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      res.status(403).json({ message: "Você não tem permissão para executar esta ação." });
      return;
    }
    next();
  };
}
