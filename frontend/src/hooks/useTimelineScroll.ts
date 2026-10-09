import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

export type TimelineMode = "pinned" | "stacked";

export interface TimelineRefs {
  /** Seção alta: a rolagem dela vira o progresso. */
  section: RefObject<HTMLElement | null>;
  /** Contêiner `sticky` (a "tela" presa). */
  pin: RefObject<HTMLElement | null>;
  /** Trilha larga que desliza na horizontal. */
  track: RefObject<HTMLElement | null>;
  /** `<ol>` dos capítulos; cada filho é um capítulo. */
  list: RefObject<HTMLElement | null>;
  /** Parte acesa da linha; o pai dela é o trilho inteiro. */
  fill: RefObject<HTMLElement | null>;
}

export interface TimelinePosition {
  /** Capítulo em foco no modo preso (0 = primeiro). */
  index: number;
  atStart: boolean;
  atEnd: boolean;
}

interface Geometry {
  mode: TimelineMode;
  /** Rolagem da janela em que a seção prende. */
  start: number;
  /** Quanto a trilha anda (px) — e quanto a seção é mais alta que a tela presa. */
  travel: number;
  viewport: number;
  /** Centro do ponto de cada capítulo, em coordenadas da trilha. */
  dots: number[];
  cards: number[];
  railLeft: number;
  railWidth: number;
  listTop: number;
  listHeight: number;
}

const REDUCED = "(prefers-reduced-motion: reduce)";
/** A cabeça da linha começa perto da borda direita da tela e chega ao fim junto com a rolagem. */
const HEAD_FROM = 0.84;
/** O "capítulo em foco" é medido num ponto que cruza a tela junto com a rolagem. */
const FOCAL_FROM = 0.25;
const FOCAL_SPAN = 0.5;
const STAGGER_MS = 130;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Topo do elemento no documento, sem contar `transform` (a entrada da página desloca a seção). */
function documentTop(element: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = element;
  while (node) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top;
}

/** Posição horizontal do elemento dentro de um ancestral posicionado, sem contar `transform`. */
function leftWithin(element: HTMLElement, ancestor: HTMLElement): number {
  let left = 0;
  let node: HTMLElement | null = element;
  while (node && node !== ancestor) {
    left += node.offsetLeft;
    node = node.offsetParent as HTMLElement | null;
  }
  return left;
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia(REDUCED).matches;
  } catch {
    return false;
  }
}

/**
 * Linha do tempo dirigida pela rolagem, sem biblioteca.
 *
 * - Modo "pinned" (o CSS decide, expondo `--hof-mode: pinned` na seção): a rolagem vertical da
 *   janela vira o `translateX` da trilha, a largura da linha e o gatilho de cada capítulo.
 * - Modo "stacked": a linha vertical cresce com a rolagem e cada capítulo revela ao entrar na tela.
 * - Movimento reduzido: o hook não liga nada; sem `data-live` o CSS mostra tudo pronto.
 *
 * Medidas só no resize (ResizeObserver); a cada quadro há apenas aritmética e escrita de
 * `transform`. O listener é passivo e só existe enquanto a seção está perto da tela.
 */
export function useTimelineScroll(refs: TimelineRefs, count: number) {
  const [mode, setMode] = useState<TimelineMode>("stacked");
  const [position, setPosition] = useState<TimelinePosition>({ index: 0, atStart: true, atEnd: false });
  const geometry = useRef<Geometry | null>(null);
  const positionRef = useRef(position);
  const { section: sectionRef, pin: pinRef, track: trackRef, list: listRef, fill: fillRef } = refs;

  const items = useCallback(() => Array.from(listRef.current?.children ?? []) as HTMLElement[], [listRef]);

  /** Rolagem da trilha (px) que põe o capítulo no ponto focal. */
  const targetFor = useCallback((index: number) => {
    const geo = geometry.current;
    if (!geo || geo.mode !== "pinned" || geo.travel === 0) return 0;
    // O último capítulo é o fim da trilha: a seta "próxima" termina ali, sem sobrar um passo.
    if (index >= geo.dots.length - 1) return geo.travel;
    const dot = geo.dots[index] ?? 0;
    const raw = (dot - FOCAL_FROM * geo.viewport) / (1 + (FOCAL_SPAN * geo.viewport) / geo.travel);
    return clamp(Math.ceil(raw), 0, geo.travel);
  }, []);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const pin = pinRef.current;
    const track = trackRef.current;
    const list = listRef.current;
    const fill = fillRef.current;
    if (!section || !pin || !track || !list || !fill) return;

    let frame = 0;
    let listening = false;
    let near = true;
    let revealObserver: IntersectionObserver | null = null;

    const reveal = (item: HTMLElement, order: number) => {
      if (item.dataset.revealed) return;
      item.style.setProperty("--hof-delay", `${order * STAGGER_MS}ms`);
      item.dataset.revealed = "true";
    };

    const publish = (next: TimelinePosition) => {
      const prev = positionRef.current;
      if (prev.index === next.index && prev.atStart === next.atStart && prev.atEnd === next.atEnd) return;
      positionRef.current = next;
      setPosition(next);
    };

    const update = () => {
      frame = 0;
      const geo = geometry.current;
      if (!geo) return;
      const scrollY = window.scrollY;

      if (geo.mode === "pinned") {
        const x = clamp(scrollY - geo.start, 0, geo.travel);
        const progress = geo.travel > 0 ? x / geo.travel : 1;
        track.style.transform = `translate3d(${-x}px, 0, 0)`;
        const head = x + geo.viewport * (HEAD_FROM + (1 - HEAD_FROM) * progress);
        fill.style.setProperty("--hof-fill", clamp((head - geo.railLeft) / geo.railWidth, 0, 1).toFixed(4));
        const focal = x + geo.viewport * (FOCAL_FROM + FOCAL_SPAN * progress) + 2;
        let index = 0;
        let order = 0;
        items().forEach((item, i) => {
          if (geo.dots[i] <= head && !item.dataset.revealed) reveal(item, order++);
          if (geo.dots[i] <= focal) index = i;
        });
        section.dataset.progress = progress.toFixed(3);
        publish({ index, atStart: x <= 1, atEnd: x >= geo.travel - 1 });
        return;
      }

      const progress = clamp((scrollY + window.innerHeight * 0.62 - geo.listTop) / Math.max(1, geo.listHeight), 0, 1);
      fill.style.setProperty("--hof-fill", progress.toFixed(4));
      section.dataset.progress = progress.toFixed(3);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const syncListener = () => {
      const wanted = near && geometry.current !== null;
      if (wanted === listening) return;
      listening = wanted;
      if (wanted) window.addEventListener("scroll", schedule, { passive: true });
      else window.removeEventListener("scroll", schedule);
    };

    const stopReveals = () => {
      revealObserver?.disconnect();
      revealObserver = null;
    };

    const measure = () => {
      if (reducedMotion()) {
        // Tudo pronto e parado: sem `data-live` o CSS não esconde nem desloca nada.
        geometry.current = null;
        stopReveals();
        delete section.dataset.live;
        delete section.dataset.progress;
        section.style.removeProperty("--hof-travel");
        track.style.transform = "";
        fill.style.removeProperty("--hof-fill");
        setMode("stacked");
        syncListener();
        return;
      }

      section.dataset.live = "true";
      const pinned = getComputedStyle(section).getPropertyValue("--hof-mode").trim() === "pinned";
      const nodes = items();

      if (pinned) {
        stopReveals();
        const viewport = pin.clientWidth;
        const travel = Math.max(0, Math.round(track.offsetWidth - viewport));
        section.style.setProperty("--hof-travel", `${travel}px`);
        const rail = fill.parentElement as HTMLElement;
        const pinTop = Number.parseFloat(getComputedStyle(pin).top) || 0;
        geometry.current = {
          mode: "pinned",
          start: documentTop(section) - pinTop,
          travel,
          viewport,
          dots: nodes.map((item) => {
            const dot = item.querySelector<HTMLElement>("[data-timeline-dot]");
            return dot ? leftWithin(dot, track) + dot.offsetWidth / 2 : leftWithin(item, track);
          }),
          cards: nodes.map((item) => item.querySelector<HTMLElement>("[data-timeline-card]")?.offsetWidth ?? item.offsetWidth),
          railLeft: leftWithin(rail, track),
          railWidth: Math.max(1, rail.offsetWidth),
          listTop: 0,
          listHeight: 0,
        };
        setMode("pinned");
      } else {
        section.style.removeProperty("--hof-travel");
        track.style.transform = "";
        geometry.current = {
          mode: "stacked", start: 0, travel: 0, viewport: 0, dots: [], cards: [], railLeft: 0, railWidth: 1,
          listTop: documentTop(list),
          listHeight: list.offsetHeight,
        };
        setMode("stacked");
        if (typeof IntersectionObserver !== "function") {
          nodes.forEach((item) => reveal(item, 0));
        } else if (!revealObserver) {
          revealObserver = new IntersectionObserver((entries) => {
            let order = 0;
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              reveal(entry.target as HTMLElement, order++);
              revealObserver?.unobserve(entry.target);
            }
          }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
          for (const item of nodes) if (!item.dataset.revealed) revealObserver.observe(item);
        }
      }
      syncListener();
      schedule();
    };

    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    resizeObserver?.observe(section);
    resizeObserver?.observe(track);
    window.addEventListener("resize", measure);

    const nearObserver = typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          near = entries[entries.length - 1]?.isIntersecting ?? true;
          syncListener();
          if (near) schedule();
        }, { rootMargin: "200px 0px" })
      : null;
    nearObserver?.observe(section);

    let media: MediaQueryList | null = null;
    try {
      media = window.matchMedia(REDUCED);
      media.addEventListener("change", measure);
    } catch {
      media = null;
    }

    measure();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      media?.removeEventListener("change", measure);
      resizeObserver?.disconnect();
      nearObserver?.disconnect();
      stopReveals();
      geometry.current = null;
    };
  }, [count, sectionRef, pinRef, trackRef, listRef, fillRef, items]);

  /** Leva a rolagem até o capítulo. */
  const goTo = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    const geo = geometry.current;
    if (geo?.mode === "pinned") {
      window.scrollTo({ top: geo.start + targetFor(index), behavior });
      return;
    }
    items()[index]?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : behavior });
  }, [items, targetFor]);

  const step = useCallback((direction: 1 | -1) => {
    const geo = geometry.current;
    if (!geo || geo.mode !== "pinned") return;
    const x = clamp(window.scrollY - geo.start, 0, geo.travel);
    const targets = geo.dots.map((_, index) => targetFor(index));
    const next = direction === 1
      ? targets.find((target) => target > x + 1) ?? geo.travel
      : [...targets].reverse().find((target) => target < x - 1) ?? 0;
    window.scrollTo({ top: geo.start + next, behavior: "smooth" });
  }, [targetFor]);

  /**
   * Foco por teclado num capítulo: ele é revelado na hora e, no modo preso, a página rola até
   * ele quando está fora da área visível — o foco nunca fica num elemento escondido.
   */
  const ensureVisible = useCallback((index: number) => {
    const item = items()[index];
    if (item && !item.dataset.revealed) {
      item.style.setProperty("--hof-delay", "0ms");
      item.dataset.revealed = "true";
    }
    const geo = geometry.current;
    if (!geo || geo.mode !== "pinned") return;
    const x = clamp(window.scrollY - geo.start, 0, geo.travel);
    const left = geo.dots[index] - x;
    const right = left + (geo.cards[index] ?? 0);
    const pinnedNow = window.scrollY >= geo.start - 1 && window.scrollY <= geo.start + geo.travel + 1;
    if (pinnedNow && left >= 16 && right <= geo.viewport - 8) return;
    window.scrollTo({ top: geo.start + targetFor(index), behavior: "auto" });
  }, [items, targetFor]);

  return { mode, position, goTo, step, ensureVisible };
}
