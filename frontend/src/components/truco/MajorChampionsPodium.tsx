import type { CSSProperties } from "react";
import type { MajorChampionEntry } from "@truco/shared";
import { OpeningTrophy, type TrophyMetal } from "../opening/OpeningTrophy";
import { Icon } from "../ui/Icon";
import { AnimatedCounter } from "./AnimatedCounter";
import { EditionPlaques } from "./EditionPlaques";
import { isOnPodium } from "./podiumEntries";
import "./MajorChampionsPodium.css";

const METAL_BY_RANK: Record<number, TrophyMetal | undefined> = { 1: "gold", 2: "silver" };
/** Intervalo da cascata de entrada entre uma vitrine e a seguinte. */
const PLACE_STEP_MS = 120;

interface MajorChampionsPodiumProps {
  entries: MajorChampionEntry[];
  /** Versão enxuta, usada em "Quem já fez história" na abertura. */
  compact?: boolean;
  /** `key` da dupla do jogador, quando ela está no ranking: ganha o selo neutro "Sua dupla". */
  mineKey?: string;
}

/**
 * Pódio do ranking histórico. As posições vêm do ranking central, inclusive em caso de empate:
 * todo 1º lugar recebe a vitrine dourada, todo 2º a prateada e o 3º fica neutro, sem metal.
 * O caneco é o mesmo da abertura (`OpeningTrophy`), em ouro e prata.
 */
export function MajorChampionsPodium({ entries, compact = false, mineKey }: MajorChampionsPodiumProps) {
  const leaders = entries.filter(isOnPodium);
  if (!leaders.length) return null;
  const tiers = [1, 2, 3].map(rank => ({ rank, places: leaders.filter(entry => entry.rank === rank) })).filter(tier => tier.places.length > 0);

  return (
    <div className={`champions-podium-real${compact ? " champions-podium-compact" : ""}`}>
      {tiers.map(({ rank, places }) => (
        <div key={rank} className={`champions-podium-tier champions-podium-tier-${rank}`}>
          {places.map(entry => {
            const metal = METAL_BY_RANK[entry.rank];
            return (
              <article key={entry.key} className={`champions-podium-place champions-podium-place-${entry.rank}`} style={{ "--place-delay": `${leaders.indexOf(entry) * PLACE_STEP_MS}ms` } as CSSProperties}>
                <div className="champions-podium-case">
                  {metal ? (
                    <div className="champions-podium-stage" aria-hidden="true">
                      <span className="champions-podium-glow" />
                      <span className="champions-podium-pool" />
                      <div className="champions-podium-cup">
                        <div className="champions-podium-reflection"><OpeningTrophy metal={metal} plate={null} /></div>
                        <OpeningTrophy metal={metal} plate={null} />
                      </div>
                    </div>
                  ) : (
                    <div className="champions-podium-medal" aria-hidden="true"><Icon name="trophy" size={24} /></div>
                  )}
                  <p className="champions-podium-head">
                    <span className="champions-podium-rank">{entry.rank}º lugar</span>
                    {entry.key === mineKey && <span className="champions-podium-mine">Sua dupla</span>}
                  </p>
                  <h3>{entry.name}</h3>
                  <strong className="champions-podium-titles"><b><AnimatedCounter value={entry.titles} duration={900} /></b> {entry.titles === 1 ? "título" : "títulos"}</strong>
                  <EditionPlaques editions={entry.editions} className="champions-podium-editions" />
                </div>
              </article>
            );
          })}
        </div>
      ))}
    </div>
  );
}
