import type { MajorChampionEntry } from "@truco/shared";

/**
 * Quem sobe ao pódio histórico: dupla com título e posição até o 3º lugar. A posição vem do
 * ranking central (`entry.rank`), empates incluídos; aqui só se decide onde a dupla aparece.
 */
export function isOnPodium(entry: MajorChampionEntry): boolean {
  return entry.titles > 0 && entry.rank <= 3;
}
