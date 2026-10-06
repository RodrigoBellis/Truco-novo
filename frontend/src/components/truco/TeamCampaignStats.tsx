import { Link } from "react-router-dom";
import type { StandingRow } from "@truco/shared";
import { Icon } from "../ui/Icon";
import "./TeamCampaignStats.css";

/** Resumo rápido da campanha da dupla. Sem classificação, mostra travessões em vez de zeros. */
export function TeamCampaignStats({ standing }: { standing?: StandingRow }) {
  const saldo = standing ? `${standing.saldoSets > 0 ? "+" : ""}${standing.saldoSets}` : "—";
  return <section className="campaign-stats premium-panel" aria-labelledby="campaign-stats-title">
    <header className="premium-panel-head">
      <h2 id="campaign-stats-title">Resumo da campanha</h2>
      <span>{standing ? `${standing.jogos} ${standing.jogos === 1 ? "jogo disputado" : "jogos disputados"}` : "Aguardando classificação"}</span>
    </header>
    <dl className="campaign-stats-grid">
      <div className="campaign-stats-points"><dd>{standing?.pontos ?? "—"}</dd><dt>Pontos</dt></div>
      <div><dd>{standing?.vitorias ?? "—"}</dd><dt>Vitórias</dt></div>
      <div><dd>{standing?.derrotas ?? "—"}</dd><dt>Derrotas</dt></div>
      <div><dd>{saldo}</dd><dt>Saldo de sets</dt></div>
    </dl>
    <Link className="premium-panel-link link-arrow" to="/grupos">Ver classificação <Icon name="arrow" size={16} /></Link>
  </section>;
}
