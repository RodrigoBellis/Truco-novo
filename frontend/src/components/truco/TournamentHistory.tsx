import { useRef } from "react";
import { Link } from "react-router-dom";
import type { HistoryEntry } from "@truco/shared";
import { Icon } from "../ui/Icon";
import { PlayerAvatar } from "../ui/PlayerAvatar";
import { ChampionTrophy } from "./ChampionTrophy";
import { buildChampionDuplas, duoLabel, editionSuit } from "../../utils/hallOfFame";
import "./TournamentHistory.css";

interface TournamentHistoryProps {
  /** Edições já ordenadas da mais recente para a mais antiga. */
  editions: HistoryEntry[];
  active: HistoryEntry;
  onSelect: (id: string) => void;
  /** Rota do ranking acumulado, quando o usuário tem acesso a ela. */
  rankingHref?: string;
}

export function TournamentHistory({ editions, active, onSelect, rankingHref }: TournamentHistoryProps) {
  const spotlightRef = useRef<HTMLElement>(null);
  const hasChampions = active.champions.some((name) => name !== "—");
  const titles = buildChampionDuplas(editions).find((duo) => duo.editions.includes(active.edition))?.titles ?? 0;
  const summary = active.notes || (hasChampions ? `${active.champions.join(" e ")} conquistaram a ${active.edition}ª Edição em ${active.year}.` : `A ${active.edition}ª Edição foi disputada em ${active.year}.`);

  function openFromTimeline(id: string) {
    onSelect(id);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    spotlightRef.current?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }

  return <section className="tournament-history" aria-labelledby="history-title">
    <div className="history-head">
      <h2 id="history-title">Histórico de Campeonatos</h2>
      {editions.length > 1 && <p>Escolha uma edição para rever quem levantou o caneco.</p>}
    </div>

    <div className="history-editions" role="group" aria-label="Escolher edição">
      {editions.map(entry => <button key={entry.id} type="button" aria-pressed={entry.id === active.id} onClick={() => onSelect(entry.id)}>
        <span className="history-edition-number">{entry.edition}ª</span>
        <span className="history-edition-text"><strong>Edição</strong><span>{entry.year}</span></span>
      </button>)}
    </div>

    <article key={active.id} ref={spotlightRef} className="history-spotlight" aria-label={`${active.edition}ª Edição · ${active.year}`}>
      <div className="history-medal">
        <span className="history-medal-ghost" aria-hidden="true">{active.edition}</span>
        <ChampionTrophy size={136} suit={editionSuit(active.edition)} />
        <strong>{active.year}</strong>
        <span>{active.edition}ª Edição</span>
      </div>
      <div className="history-story">
        <h3>{active.name}</h3>
        <p className="history-notes">{summary}</p>
        <dl className="history-final">
          <div className="history-champion">
            <dt>Campeões</dt>
            <dd>{hasChampions ? <span className="history-duo">{active.champions.map(name => <span key={name} className="history-player"><PlayerAvatar name={name} size="sm" />{name}</span>)}</span> : duoLabel(active.champions)}</dd>
          </div>
          {active.runnersUp && <div className="history-runner-up"><dt>Vice-campeões</dt><dd>{duoLabel(active.runnersUp)}</dd></div>}
          {active.finalResult && <div className="history-result"><dt>Placar da final</dt><dd>{active.finalResult}</dd></div>}
        </dl>
        {hasChampions && titles > 0 && <p className="history-legacy">
          <Icon name="trophy" size={18} />
          <span>{titles === 1 ? "Único título desta dupla" : `${titles} títulos desta dupla`} nas edições registradas.</span>
          {rankingHref && <Link to={rankingHref} className="link-arrow">Ver ranking geral <Icon name="arrow" size={16} /></Link>}
        </p>}
      </div>
    </article>

    {editions.length > 1 && <div className="history-archive">
      <h3 id="history-archive-title">Linha do tempo</h3>
      <ol className="history-timeline" aria-labelledby="history-archive-title">
        {editions.map(entry => <li key={entry.id} className={entry.id === active.id ? "history-timeline-active" : undefined}>
          <span className="history-timeline-year">{entry.year}</span>
          <div className="history-timeline-body">
            <strong>{duoLabel(entry.champions)}</strong>
            <span>{entry.edition}ª edição{entry.finalResult ? ` · final ${entry.finalResult}` : ""}</span>
          </div>
          <button type="button" onClick={() => openFromTimeline(entry.id)} aria-label={`Ver detalhes da ${entry.edition}ª edição`} aria-current={entry.id === active.id ? "true" : undefined}>{entry.id === active.id ? "Em destaque" : <>Ver edição <Icon name="arrow" size={15} /></>}</button>
        </li>)}
      </ol>
    </div>}
  </section>;
}
