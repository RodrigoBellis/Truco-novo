import type { CSSProperties } from "react";
import type { Team } from "@truco/shared";

// Matizes OKLCH espaçados para que duplas vizinhas na lista não fiquem com
// cores parecidas. A luminosidade e a saturação ficam no CSS (.team-tint),
// então cada tema ajusta o contraste sem mudar a identidade da dupla.
const TEAM_HUES = [255, 45, 155, 330, 95, 205, 20, 290, 130, 180, 355, 70];

function hashHue(teamId: string): number {
  let hash = 0;
  for (const char of teamId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TEAM_HUES[hash % TEAM_HUES.length];
}

/**
 * Matiz fixo de uma dupla. Com a lista de duplas da edição a cor vem da ordem
 * estável dos ids, o que garante uma cor diferente por dupla; sem a lista, cai
 * num hash do id (estável, mas pode repetir).
 */
export function teamHue(teamId: string | null | undefined, teams: Team[] = []): number | undefined {
  if (!teamId) return undefined;
  const ids = teams.filter((team) => !team.isPlaceholder).map((team) => team.id).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const index = ids.indexOf(teamId);
  return index >= 0 ? TEAM_HUES[index % TEAM_HUES.length] : hashHue(teamId);
}

/** Estilo inline que entrega o matiz para as classes `.team-tint`. */
export function teamTintStyle(hue: number | undefined): CSSProperties | undefined {
  return hue == null ? undefined : ({ "--team-hue": hue } as CSSProperties);
}
