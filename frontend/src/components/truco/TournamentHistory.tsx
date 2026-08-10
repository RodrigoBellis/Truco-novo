import { useCallback, useEffect, useMemo, useState } from "react";
import type { HistoryEntry } from "@truco/shared";
import { ChampionTrophy } from "./ChampionTrophy";
import "./TournamentHistory.css";

const SUITS = ["♠", "♥", "♣", "♦"] as const;
const AUTOPLAY_MS = 4500;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function TournamentHistory({ editions }: { editions: HistoryEntry[] }) {
  const sorted = useMemo(() => [...editions].sort((a, b) => b.edition - a.edition), [editions]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const reducedMotion = useMemo(prefersReducedMotion, []);

  const goTo = useCallback(
    (index: number) => {
      if (sorted.length === 0) return;
      setActiveIndex(((index % sorted.length) + sorted.length) % sorted.length);
    },
    [sorted.length],
  );

  useEffect(() => {
    if (reducedMotion || isPaused || sorted.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % sorted.length);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [reducedMotion, isPaused, sorted.length]);

  if (sorted.length === 0) return null;

  return (
    <section className="tournament-history">
      <h2 className="hof-section-title">Histórico de Campeonatos</h2>

      <div
        className="th-stage"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
      >
        <div className="th-track">
          {sorted.map((entry, index) => {
            const offset = index - activeIndex;
            const distance = Math.abs(offset);
            const isActive = offset === 0;
            const style = {
              transform: `translateX(${offset * 56}%) translateZ(${distance * -190}px) rotateY(${offset * -34}deg) scale(${
                isActive ? 1 : 0.92
              })`,
              opacity: distance > 2 ? 0 : 1 - distance * 0.34,
              zIndex: sorted.length - distance,
              pointerEvents: distance > 2 ? ("none" as const) : ("auto" as const),
            };

            return (
              <div key={entry.id} className="th-slot" style={style} aria-hidden={!isActive}>
                <article className={`th-card${isActive ? " th-card-active" : ""}`}>
                  <span className="th-card-edition">{entry.edition}ª Edição</span>

                  <ChampionTrophy size={72} suit={SUITS[(entry.edition - 1) % SUITS.length]} />

                  <h3 className="th-card-name">{entry.name}</h3>
                  <span className="th-card-year">{entry.year}</span>

                  <div className="th-card-result">
                    <div className="th-card-side th-card-side-center">
                      <span className="th-card-side-label">🏆 Campeão</span>
                      <span className="th-card-side-value">{entry.champions.join(" & ")}</span>
                    </div>
                    <div className="th-card-score">{entry.finalResult ?? "—"}</div>
                  </div>

                  <p className="th-card-notes text-muted">
                    <span aria-hidden="true">🃏 </span>
                    {entry.notes}
                  </p>
                </article>
              </div>
            );
          })}
        </div>

        <button type="button" className="th-arrow th-arrow-prev" onClick={() => goTo(activeIndex - 1)} aria-label="Edição anterior">
          ‹
        </button>
        <button type="button" className="th-arrow th-arrow-next" onClick={() => goTo(activeIndex + 1)} aria-label="Próxima edição">
          ›
        </button>
      </div>

      <div className="th-dots" role="tablist" aria-label="Edições do campeonato">
        {sorted.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={index === activeIndex}
            aria-label={`${entry.edition}ª Edição`}
            className={`th-dot${index === activeIndex ? " th-dot-active" : ""}`}
            onClick={() => goTo(index)}
          />
        ))}
      </div>
    </section>
  );
}
