import type { StandingRow } from "@truco/shared";
import { AnimatedCounter } from "./AnimatedCounter";
import "./TeamPerformanceStrip.css";

/**
 * Faixa de desempenho da dupla. Os números são os da classificação central, sem recálculo;
 * sem classificação mostra travessões em vez de zeros.
 */
export function TeamPerformanceStrip({ standing }: { standing?: StandingRow }) {
  const stats = [
    { key: "points", label: "Pontos", value: standing?.pontos },
    { key: "wins", label: "Vitórias", value: standing?.vitorias },
    { key: "losses", label: "Derrotas", value: standing?.derrotas },
    { key: "balance", label: "Saldo de quedas", value: standing?.saldoSets, signed: true },
  ];
  return (
    <section className="team-performance" aria-label="Desempenho da dupla">
      <dl className="team-performance-grid">
        {stats.map((stat) => (
          <div key={stat.key} className={`team-performance-stat team-performance-stat-${stat.key}`}>
            <dt>{stat.label}</dt>
            <dd>{stat.value == null ? "—" : <>{stat.signed && stat.value > 0 ? "+" : ""}<AnimatedCounter value={stat.value} duration={900} /></>}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
