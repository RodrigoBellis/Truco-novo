import type { AuthUser } from "@truco/shared";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export const SESSION_STORAGE_KEY = "truco-do-novo:session";

export interface StoredSession {
  user: AuthUser;
  token: string;
  refreshToken: string;
}

export function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredSession : null;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: StoredSession) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

// Called synchronously by onAuthStateChange: never call Auth methods in its callback.
export function syncStoredSession(session: Session): StoredSession | null {
  const stored = readStoredSession();
  if (!stored || stored.user.id !== session.user.id) return null;
  const updated = { ...stored, token: session.access_token, refreshToken: session.refresh_token };
  writeStoredSession(updated);
  return updated;
}

let restoring: Promise<StoredSession | null> | null = null;

export function restoreStoredSession(): Promise<StoredSession | null> {
  if (restoring) return restoring;
  restoring = (async () => {
    const stored = readStoredSession();
    if (!stored) return null;
    const { data, error } = await supabase.auth.setSession({
      access_token: stored.token,
      refresh_token: stored.refreshToken,
    });
    if (error || !data.session || data.session.user.id !== stored.user.id) {
      clearStoredSession();
      return null;
    }
    return syncStoredSession(data.session);
  })().finally(() => { restoring = null; });
  return restoring;
}

export async function getAccessToken(): Promise<string | null> {
  if (restoring) await restoring;
  if (!readStoredSession()) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    return (await restoreStoredSession())?.token ?? null;
  }
  return syncStoredSession(data.session)?.token ?? null;
}
