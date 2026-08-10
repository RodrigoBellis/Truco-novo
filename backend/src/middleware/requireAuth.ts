import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@truco/shared";
import { supabaseAdmin } from "../data/supabaseClient.js";

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  playerId: string;
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

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ message: "Sessão inválida ou expirada." });
    return;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("truco_profiles")
    .select("truco_id, truco_player_id, role")
    .eq("truco_id", data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    res.status(403).json({ message: "Perfil não encontrado para este usuário." });
    return;
  }

  req.authUser = { id: profile.truco_id, role: profile.role, playerId: profile.truco_player_id };
  next();
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
