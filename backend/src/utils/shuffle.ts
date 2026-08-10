import type { RandomFn } from "./seededRandom.js";

/**
 * Embaralha uma cópia da lista (Fisher-Yates).
 * Aceita um gerador injetável para permitir execuções determinísticas na simulação.
 */
export function shuffle<T>(input: T[], random: RandomFn = Math.random): T[] {
  const result = [...input];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
