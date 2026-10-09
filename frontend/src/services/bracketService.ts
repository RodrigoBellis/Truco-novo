import type { BracketMatch, KnockoutStatus } from "@truco/shared";
import { apiRequest } from "./api";

export function getBracket(): Promise<BracketMatch[]> {
  return apiRequest<BracketMatch[]>("/bracket");
}

export function getKnockoutStatus(): Promise<KnockoutStatus> {
  return apiRequest<KnockoutStatus>("/bracket/status");
}
