import type { AuthUser } from "@truco/shared";
import { homePathForRole } from "./roles";

const openingKey = (userId: string) => `truco-opening:${userId}`;

export function entryPathForUser(user: AuthUser): string {
  if (user.role !== "jogador") return homePathForRole(user.role);
  try { return sessionStorage.getItem(openingKey(user.id)) === "seen" ? "/inicio" : "/abertura"; }
  catch { return "/inicio"; }
}

export function markOpeningSeen(userId: string): void {
  try { sessionStorage.setItem(openingKey(userId), "seen"); } catch { /* A navegação continua mesmo sem armazenamento disponível. */ }
}
