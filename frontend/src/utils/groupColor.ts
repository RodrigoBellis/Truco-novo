import type { GroupId } from "@truco/shared";

/**
 * Classes que entregam a cor do grupo (`.group-tone` em styles/global.css).
 * Partidas sem grupo (mata-mata) ficam sem cor própria.
 */
export function groupToneClass(groupId: GroupId | null | undefined): string {
  return groupId ? `group-tone group-tone-${groupId.toLowerCase()}` : "";
}
