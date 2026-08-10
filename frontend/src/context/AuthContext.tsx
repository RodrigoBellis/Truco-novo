import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser } from "@truco/shared";
import { login as loginRequest, type LoginIdentifier } from "../services/authService";
import { supabase } from "../lib/supabaseClient";
import { AuthContext } from "./auth-context";

const STORAGE_KEY = "truco-do-novo:session";

interface StoredSession {
  user: AuthUser;
  token: string;
  refreshToken: string;
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

/** Autentica o cliente supabase-js como o usuário logado — sem isso, o Realtime
 *  (postgres_changes) não recebe nada, porque RLS trata a conexão como anônima. */
async function syncSupabaseRealtimeAuth(token: string, refreshToken: string) {
  try {
    await supabase.auth.setSession({ access_token: token, refresh_token: refreshToken });
  } catch {
    // Realtime fica sem autenticação (sem updates ao vivo), mas a API REST via
    // backend continua funcionando normalmente — não é um erro fatal de login.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const session = readStoredSession();
    if (session) {
      setUser(session.user);
      setToken(session.token);
      if (session.refreshToken) void syncSupabaseRealtimeAuth(session.token, session.refreshToken);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (identifier: LoginIdentifier, password: string) => {
    const response = await loginRequest(identifier, password);
    setUser(response.user);
    setToken(response.token);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(response));
    void syncSupabaseRealtimeAuth(response.token, response.refreshToken);
    return response.user;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    window.localStorage.removeItem(STORAGE_KEY);
    void supabase.auth.signOut();
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((current) => {
      if (!current) return current;
      const updated = { ...current, ...patch };
      const session = readStoredSession();
      if (session) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, user: updated }));
      }
      return updated;
    });
  }, []);

  const value = useMemo(
    () => ({ user, token, isLoading, login, logout, updateUser }),
    [user, token, isLoading, login, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
