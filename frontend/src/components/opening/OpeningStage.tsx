import { useEffect, useRef } from "react";
import { clamp, prefersReducedMotion } from "../login/deckMotion";
import { OpeningTrophy } from "./OpeningTrophy";
import { SuitMark, type Suit } from "./SuitMark";
import "./OpeningStage.css";

interface StageCardProps {
  rank: string;
  suit: Suit;
  side: "left" | "center" | "right";
}

function StageCard({ rank, suit, side }: StageCardProps) {
  const corner = <><b>{rank}</b><SuitMark suit={suit} /></>;
  return (
    <div className={`opening-card opening-card-${side}`}>
      {/* Só este nível anima na entrada: a carta é dada virando do verso para a face. */}
      <div className="opening-card-flip">
        <div className={`opening-card-face${suit === "heart" || suit === "diamond" ? " opening-card-warm" : ""}`}>
          <span className="opening-card-corner">{corner}</span>
          <SuitMark suit={suit} className="opening-card-pip" />
          <span className="opening-card-corner opening-card-corner-flip">{corner}</span>
        </div>
        <div className="opening-card-back"><SuitMark suit="spade" /></div>
      </div>
    </div>
  );
}

/** Ciclo da flutuação do caneco e da respiração do halo. */
const IDLE_MS = 6000;
/** O ambiente só começa depois que a entrada assentou. */
const IDLE_DELAY_MS = 1700;

/**
 * Palco da abertura: o caneco sobre a mesa, com as três manilhas (7 de copas, zap e
 * espadilha) abertas em leque atrás dele. É decorativo — fica fora da árvore de acessibilidade.
 *
 * Movimento depois da entrada:
 * - paralaxe e luz que seguem o mouse (só custom properties, e só com ponteiro fino);
 * - exceção aprovada à regra "nada em laço": o caneco flutua e o halo respira. Esse ambiente
 *   pausa quando o palco sai da tela ou a aba fica oculta e não existe com movimento reduzido.
 */
export function OpeningStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const breathRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const host = stage?.closest<HTMLElement>(".opening-hero");
    if (!stage || !host) return;
    let fine = false;
    try {
      fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    } catch {
      return;
    }
    if (!fine || prefersReducedMotion()) return;

    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      frame = 0;
      stage.style.setProperty("--px", x.toFixed(3));
      stage.style.setProperty("--py", y.toFixed(3));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x = clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
      y = clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
      schedule();
    };
    const leave = () => { x = 0; y = 0; schedule(); };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const floatEl = floatRef.current;
    const breathEl = breathRef.current;
    if (!stage || !floatEl || !breathEl) return;
    if (typeof Animation !== "function" || typeof KeyframeEffect !== "function") return;

    let reduced: MediaQueryList | null = null;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return;
    }

    const timing: KeyframeEffectOptions = { duration: IDLE_MS, delay: IDLE_DELAY_MS, iterations: Infinity };
    let running: Animation[] = [];
    let onScreen = true;

    const sync = () => {
      const active = onScreen && !document.hidden;
      for (const animation of running) {
        if (active) animation.play();
        else animation.pause();
      }
    };
    const stop = () => {
      for (const animation of running) animation.cancel();
      running = [];
    };
    const start = () => {
      stop();
      if (reduced?.matches) return;
      running = [
        new Animation(new KeyframeEffect(floatEl, [
          { transform: "translate3d(0, 0, 0)", easing: "ease-in-out" },
          { transform: "translate3d(0, -4px, 0)", easing: "ease-in-out" },
          { transform: "translate3d(0, 0, 0)" },
        ], timing)),
        new Animation(new KeyframeEffect(breathEl, [
          { opacity: 1, transform: "scale(1)", easing: "ease-in-out" },
          { opacity: 0.8, transform: "scale(1.05)", easing: "ease-in-out" },
          { opacity: 1, transform: "scale(1)" },
        ], timing)),
      ];
      // O id identifica a exceção em laço da abertura para quem inspeciona as animações.
      running[0].id = "opening-ambient-float";
      running[1].id = "opening-ambient-halo";
      sync();
    };

    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          onScreen = entries[entries.length - 1]?.isIntersecting ?? true;
          sync();
        })
      : null;
    observer?.observe(stage);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", start);
    start();

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduced?.removeEventListener("change", start);
      stop();
    };
  }, []);

  return (
    <div className="opening-stage" ref={stageRef} aria-hidden="true">
      <div className="opening-scene">
        <span className="opening-spot" />
        <div className="opening-halo-shift">
          <div className="opening-halo-breath" ref={breathRef}><span className="opening-halo" /></div>
        </div>
        <div className="opening-table">
          <span className="opening-table-pool" />
          <span className="opening-table-glint" />
          <span className="opening-table-shadow" />
        </div>
        <StageCard rank="7" suit="heart" side="left" />
        <StageCard rank="A" suit="spade" side="right" />
        <StageCard rank="4" suit="club" side="center" />
        <div className="opening-trophy-layer">
          <div className="opening-trophy-float" ref={floatRef}>
            <div className="opening-trophy-rise"><OpeningTrophy /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
