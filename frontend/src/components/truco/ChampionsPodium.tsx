import type { ChampionDupla } from "../../utils/hallOfFame";
import { useEffect, useRef, useState } from "react";
import { ChampionTrophy } from "./ChampionTrophy";
import "./ChampionsPodium.css";

const PLACE_ORDER = [2, 1, 3] as const;
const PLACE_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const PLACE_SUIT: Record<number, "♠" | "♥" | "♣" | "♦"> = { 1: "♠", 2: "♥", 3: "♣" };
/** Revela na ordem 3º → 2º → 1º, deixando o campeão por último. */
const PLACE_DELAY_MS: Record<number, number> = { 3: 0, 2: 150, 1: 300 };

export function ChampionsPodium({ top3 }: { top3: ChampionDupla[] }) {
  const podiumRef = useRef<HTMLDivElement>(null);
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    const node = podiumRef.current;
    if (!node || hasEntered) return;
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setHasEntered(true);
      observer.disconnect();
    }, { threshold: 0.2 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasEntered]);

  if (top3.length === 0) return null;

  const byPlace = new Map<number, ChampionDupla>();
  top3.forEach((dupla, index) => byPlace.set(index + 1, dupla));

  return (
    <div ref={podiumRef} className={`podium${hasEntered ? " podium-revealed" : ""}`}>
      {PLACE_ORDER.map((place) => {
        const dupla = byPlace.get(place);
        if (!dupla) return <div key={place} className={`podium-slot podium-slot-empty podium-slot-${place}`} />;

        const isFirst = place === 1;

        return (
          <div
            key={place}
            className={`podium-slot podium-slot-${place}`}
            style={{ animationDelay: `${PLACE_DELAY_MS[place]}ms` }}
          >
            <div className="podium-card">
              {isFirst && <span className="podium-crown" aria-hidden="true">👑</span>}
              <ChampionTrophy size={isFirst ? 76 : 56} suit={PLACE_SUIT[place]} />
              <span className="podium-medal" aria-hidden="true">
                {PLACE_MEDAL[place]}
              </span>
              <h3 className="podium-name">{dupla.name}</h3>
              <span className="podium-titles">
                {dupla.titles} {dupla.titles === 1 ? "título" : "títulos"}
              </span>
            </div>
            <div className={`podium-base podium-base-${place}`}>
              <span className="podium-place-number">{place}º</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
