import type { UserRole } from "@truco/shared";

/** admin e superadmin têm acesso à área administrativa; só a role exata muda o que cada um pode fazer lá dentro. */
export function isAdminRole(role: UserRole | undefined | null): boolean {
  return role === "admin" || role === "superadmin";
}

export function homePathForRole(role: UserRole | undefined | null): string {
  return isAdminRole(role) ? "/admin" : "/inicio";
}
