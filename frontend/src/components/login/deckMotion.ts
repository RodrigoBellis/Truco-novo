import { IS_DEV_BUILD } from "../../utils/navigation";

/**
 * Nível de experiência do palco de cartas (progressive enhancement):
 * - full: arco 3D, balanço físico, reflexo que acompanha o ponteiro e luz WebGL;
 * - lite: mesmo arco 3D, sem luz WebGL e com menos cartas visíveis (aparelho fraco);
 * - reduced: fila plana sem rotação nem mola (prefers-reduced-motion).
 */
export type DeckMode = "full" | "lite" | "reduced";

const MODES: readonly DeckMode[] = ["full", "lite", "reduced"];

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function detectDeckMode(): DeckMode {
  // Só no build de desenvolvimento: `?deck=lite` força um nível para conferir cada versão.
  if (IS_DEV_BUILD) {
    const forced = new URLSearchParams(window.location.search).get("deck");
    if (forced && (MODES as readonly string[]).includes(forced)) return forced as DeckMode;
  }
  if (prefersReducedMotion()) return "reduced";
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const weak = (nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2 || nav.connection?.saveData === true;
  const has3d = typeof CSS !== "undefined" && CSS.supports("transform-style", "preserve-3d");
  return weak || !has3d ? "lite" : "full";
}

/** Mola amortecida (semi-implícita): estável mesmo com quadros longos. */
export function springStep(position: number, velocity: number, target: number, dt: number, stiffness: number, damping: number) {
  const acceleration = stiffness * (target - position) - damping * velocity;
  const nextVelocity = velocity + acceleration * dt;
  return { position: position + nextVelocity * dt, velocity: nextVelocity };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Arrastar além da primeira/última carta resiste, como um elástico. */
export function rubberBand(position: number, max: number): number {
  if (position < 0) return position * 0.35;
  if (position > max) return max + (position - max) * 0.35;
  return position;
}
