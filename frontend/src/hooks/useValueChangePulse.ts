import { useEffect, useRef } from "react";

type Keyframes = Parameters<Element["animate"]>[0];

const POP: Keyframes = [
  { transform: "scale(1)" },
  { transform: "scale(1.14)" },
  { transform: "scale(1)" },
];

const RISE: Keyframes = [
  { opacity: 0, transform: "translateY(6px)" },
  { opacity: 1, transform: "translateY(0)" },
];

/**
 * Anima um elemento quando o valor que ele exibe muda — e só então.
 *
 * A diferença para uma animação CSS de entrada: aquela dispara toda vez que o
 * componente monta, inclusive numa simples recarga de dados. Esta só dispara
 * quando o conteúdo realmente mudou, que é quando o movimento tem algo a
 * comunicar (um placar que acabou de sair, uma vaga do mata-mata que foi
 * preenchida). Na primeira renderização fica quieta.
 *
 * Usa Web Animations API direto no elemento: sem estado, sem re-render, e
 * anima só transform/opacity.
 */
export function useValueChangePulse<T extends HTMLElement>(value: string, variant: "pop" | "rise" = "pop") {
  const ref = useRef<T>(null);
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const isFirstRender = previous.current === null;
    const changed = previous.current !== value;
    previous.current = value;

    if (isFirstRender || !changed || !ref.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    ref.current.animate(variant === "pop" ? POP : RISE, {
      duration: variant === "pop" ? 380 : 300,
      easing: variant === "pop" ? "cubic-bezier(0.34, 1.56, 0.64, 1)" : "cubic-bezier(0.16, 1, 0.3, 1)",
    });
  }, [value, variant]);

  return ref;
}
