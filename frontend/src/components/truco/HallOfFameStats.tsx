import type { HallOfFameStats as Stats } from "../../utils/hallOfFame";
import { AnimatedCounter } from "./AnimatedCounter";
import "./HallOfFameStats.css";

export function HallOfFameStats({ stats }: { stats: Stats }) {
  return (
    <div className="hof-stats">
      <div className="hof-stat-card">
        <span className="hof-stat-icon" aria-hidden="true">
          🏆
        </span>
        <span className="hof-stat-value">
          <AnimatedCounter value={stats.totalEditions} />
        </span>
        <span className="hof-stat-label">Títulos distribuídos</span>
      </div>

      <div className="hof-stat-card">
        <span className="hof-stat-icon" aria-hidden="true">
          🎉
        </span>
        <span className="hof-stat-value">
          <AnimatedCounter value={stats.totalChampionDuplas} />
        </span>
        <span className="hof-stat-label">Duplas campeãs</span>
      </div>

      <div className="hof-stat-card">
        <span className="hof-stat-icon" aria-hidden="true">
          🃏
        </span>
        <span className="hof-stat-value">
          <AnimatedCounter value={stats.totalFinalsParticipants} />
        </span>
        <span className="hof-stat-label">Duplas em finais</span>
      </div>
    </div>
  );
}
