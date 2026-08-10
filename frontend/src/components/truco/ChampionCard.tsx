import type { ChampionDupla } from "../../utils/hallOfFame";
import "./ChampionCard.css";

const SUITS = ["♠", "♥", "♣", "♦"] as const;

export function ChampionCard({ dupla, rank }: { dupla: ChampionDupla; rank: number }) {
  return (
    <article className="champion-card" style={{ animationDelay: `${Math.min(rank, 8) * 60}ms` }}>
      <div className="champion-card-top">
        <span className="champion-card-rank">{rank}º</span>
        <span className="champion-card-suit" aria-hidden="true">
          {SUITS[rank % SUITS.length]}
        </span>
      </div>

      <h3 className="champion-card-name">{dupla.name}</h3>

      <div className="champion-card-stats">
        <div className="champion-card-stat">
          <span className="champion-card-stat-value">{dupla.titles}</span>
          <span className="champion-card-stat-label">{dupla.titles === 1 ? "Título" : "Títulos"}</span>
        </div>
        <div className="champion-card-stat">
          <span className="champion-card-stat-value">{dupla.runnerUps}</span>
          <span className="champion-card-stat-label">{dupla.runnerUps === 1 ? "Vice" : "Vices"}</span>
        </div>
        <div className="champion-card-stat">
          <span className="champion-card-stat-value">{dupla.winRate}%</span>
          <span className="champion-card-stat-label">Aproveitamento</span>
        </div>
      </div>

      <span className="champion-card-editions text-faint">
        {dupla.editions.length === 1 ? `Campeã na ${dupla.editions[0]}ª edição` : `Campeã nas edições ${dupla.editions.join(", ")}`}
      </span>
    </article>
  );
}
