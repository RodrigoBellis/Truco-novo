import type { RankingEntry } from "@truco/shared";
import { apiRequest } from "./api";

export function getRanking(): Promise<RankingEntry[]> {
  return apiRequest<RankingEntry[]>("/ranking");
}
