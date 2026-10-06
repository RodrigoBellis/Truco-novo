import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser } from "@truco/shared";
import { login as loginRequest, type LoginIdentifier } from "../services/authService";
import { supabase } from "../lib/supabaseClient";
import { AuthContext } from "./auth-context";
import { clearStoredSession, readStoredSession, restoreStoredSession, syncStoredSession, writeStoredSession } from "../lib/authSession";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (session) {
        const stored = syncStoredSession(session);
        if (stored) {
          setUser(stored.user);
          setToken(stored.token);
        }
      } else if (event === "SIGNED_OUT") {
        clearStoredSession();
        setUser(null);
        setToken(null);
      }
    });
    // Protected pages must wait until the expired token has been renewed.
    void restoreStoredSession().then((session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      setToken(session?.token ?? null);
    }).catch(() => {
      if (!cancelled) {
        clearStoredSession();
        setUser(null);
        setToken(null);
      }
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (identifier: LoginIdentifier, password: string) => {
    const response = await loginRequest(identifier, password);
    writeStoredSession(response);
    const session = await restoreStoredSession();
    if (!session) throw new Error("Não foi possível iniciar a sessão. Entre novamente.");
    setUser(session.user);
    setToken(session.token);
    return response.user;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    clearStoredSession();
    void supabase.auth.signOut();
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((current) => {
      if (!current) return current;
      const updated = { ...current, ...patch };
      const session = readStoredSession();
      if (session) {
        writeStoredSession({ ...session, user: updated });
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
