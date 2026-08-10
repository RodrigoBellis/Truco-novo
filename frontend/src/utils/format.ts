import type { MatchResult } from "@truco/shared";

export function formatScore(result: MatchResult | null): string {
  if (!result) return "—";
  return `${result.setsA}x${result.setsB}`;
}

export function initials(name: string): string {
  return name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ordinal(position: number): string {
  return `${position}º`;
}
