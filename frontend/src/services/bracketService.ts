import type { BracketMatch } from "@truco/shared";
import { apiRequest } from "./api";

export function getBracket(): Promise<BracketMatch[]> {
  return apiRequest<BracketMatch[]>("/bracket");
}

export function generateBracket(): Promise<BracketMatch[]> {
  return apiRequest<BracketMatch[]>("/bracket/generate", { method: "POST" });
}
