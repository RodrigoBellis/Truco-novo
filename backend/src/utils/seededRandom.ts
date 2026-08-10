/**
 * Gerador pseudoaleatório determinístico (mulberry32).
 * Usado apenas pelo modo de simulação, para que a mesma seed produza sempre o mesmo campeonato.
 */
export type RandomFn = () => number;

export function createSeededRandom(seed: number): RandomFn {
  let state = seed >>> 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed padrão da simulação — garante reprodutibilidade entre execuções. */
export const DEFAULT_SIMULATION_SEED = 20260;
