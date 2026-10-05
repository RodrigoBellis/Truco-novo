import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * FLIP (First, Last, Invert, Play) para listas que se reordenam.
 *
 * O problema: quando uma dupla sobe de posição, o React apenas repinta as
 * linhas em outra ordem. Para quem está olhando, a tabela "pisca" e os nomes
 * trocam de lugar — ninguém percebe QUEM subiu. Numa classificação de
 * campeonato, essa é justamente a informação mais importante.
 *
 * A técnica: guardamos onde cada linha estava (First), deixamos o React
 * pintar a ordem nova (Last), aplicamos um translate que devolve a linha
 * visualmente à posição antiga (Invert) e animamos até zero (Play). O
 * resultado é a linha deslizando fisicamente até o novo lugar.
 *
 * Anima só `transform`, via Web Animations API — roda no compositor, sem
 * layout nem paint por quadro, e sem nenhuma dependência nova.
 *
 * Uso:
 *   const registerRow = useFlipReorder(rows.map((r) => r.id));
 *   ...
 *   <tr ref={registerRow(row.id)} />
 */
export function useFlipReorder(keys: string[]) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const prevRects = useRef(new Map<string, DOMRect>());

  const register = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) nodes.current.set(key, el);
      else nodes.current.delete(key);
    },
    [],
  );

  // A ordem é o que dispara o efeito. Como `keys` é um array novo a cada
  // render, comparar a versão serializada evita reanimar à toa.
  const order = keys.join("|");

  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nextRects = new Map<string, DOMRect>();

    nodes.current.forEach((el, key) => {
      const rect = el.getBoundingClientRect();
      nextRects.set(key, rect);

      if (reduced) return;

      const prev = prevRects.current.get(key);
      // Sem posição anterior a linha acabou de entrar: quem cuida da
      // entrada é o .stagger do container, não o FLIP.
      if (!prev) return;

      const dy = prev.top - rect.top;
      // Meio pixel de diferença é ruído de arredondamento, não movimento.
      if (Math.abs(dy) < 1) return;

      el.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
        { duration: 420, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
      );

      // dy > 0 significa que a linha estava mais embaixo e subiu.
      const cls = dy > 0 ? "flip-moved-up" : "flip-moved-down";
      el.classList.remove("flip-moved-up", "flip-moved-down");
      // Força o reflow para que readicionar a classe reinicie a animação
      // quando a linha se move duas vezes seguidas.
      void el.offsetWidth;
      el.classList.add(cls);
      el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
    });

    prevRects.current = nextRects;
  }, [order]);

  return register;
}
