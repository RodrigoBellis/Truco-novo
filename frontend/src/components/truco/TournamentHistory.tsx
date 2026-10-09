import { useEffect, useRef, useState, type ReactNode } from "react";
import type { HistoryEntry } from "@truco/shared";
import { Icon } from "../ui/Icon";
import { PlayerAvatar } from "../ui/PlayerAvatar";
import { OpeningTrophy } from "../opening/OpeningTrophy";
import { EditionTimeline, type EditionTimelineHandle } from "./EditionTimeline";
import { duoLabel, hasRegisteredDuo, type EditionChapter } from "../../utils/hallOfFame";
import "./TournamentHistory.css";

interface TournamentHistoryProps {
  /** Bloco de abertura da página (selo, `h1`, frase), mostrado no começo da linha do tempo. */
  intro: ReactNode;
  /** Capítulos em ordem cronológica, incluindo a edição em disputa quando houver. */
  chapters: EditionChapter[];
  /** Edição encerrada com o detalhe aberto; `null` quando ainda não há nenhuma. */
  active: HistoryEntry | null;
  onSelect: (id: string) => void;
}

/** Linha do tempo por edições + o detalhe da edição escolhida. */
export function TournamentHistory({ intro, chapters, active, onSelect }: TournamentHistoryProps) {
  const timelineRef = useRef<EditionTimelineHandle>(null);
  const detailRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Cada pedido de detalhe leva a rolagem e o foco até o painel, mesmo repetindo a edição.
  const [request, setRequest] = useState(0);

  useEffect(() => {
    if (request === 0) return;
    const detail = detailRef.current;
    if (!detail) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Trajeto longo (a seção presa é alta) vira salto: rolar tudo passaria a trilha inteira voando.
    const far = Math.abs(detail.getBoundingClientRect().top) > window.innerHeight * 1.5;
    detail.scrollIntoView({ block: "start", behavior: reduced || far ? "auto" : "smooth" });
    titleRef.current?.focus({ preventScroll: true });
  }, [request]);

  function openDetails(edition: number) {
    const chapter = chapters.find((item) => item.edition === edition);
    if (chapter?.kind !== "closed") return;
    onSelect(chapter.entry.id);
    setRequest((value) => value + 1);
  }

  const registered = active ? hasRegisteredDuo(active.champions) : false;
  const summary = active
    ? active.notes || (registered
      ? `${active.champions.join(" e ")} conquistaram a ${active.edition}ª Edição.`
      : `A ${active.edition}ª Edição foi disputada; a dupla campeã não está registrada.`)
    : "";

  return (
    <>
      <EditionTimeline ref={timelineRef} intro={intro} chapters={chapters} activeEdition={active?.edition ?? null} onOpenDetails={openDetails} />

      {active && (
        <article key={active.id} ref={detailRef} className="history-detail" aria-labelledby="history-detail-title">
          <div className="history-detail-showcase" aria-hidden="true">
            <span className="history-detail-halo" />
            <OpeningTrophy metal="gold" plate={`${active.edition}ª EDIÇÃO`} />
          </div>
          <div className="history-detail-story">
            <p className="history-detail-kicker">Detalhes da {active.edition}ª Edição</p>
            <h2 id="history-detail-title" ref={titleRef} tabIndex={-1}>{active.name}</h2>
            <p className="history-detail-notes">{summary}</p>
            <dl className="history-final">
              <div className="history-champion">
                <dt>Campeões</dt>
                <dd>{registered ? <span className="history-duo">{active.champions.map((name, slot) => <span key={`${slot}-${name}`} className="history-player"><PlayerAvatar name={name} size="md" />{name}</span>)}</span> : duoLabel(active.champions)}</dd>
              </div>
              {active.runnersUp && <div className="history-runner-up"><dt>Vice-campeões</dt><dd>{duoLabel(active.runnersUp)}</dd></div>}
              {active.finalResult && <div className="history-result"><dt>Placar da final</dt><dd>{active.finalResult}</dd></div>}
            </dl>
            <button type="button" className="history-detail-back" onClick={() => timelineRef.current?.focusChapter(active.edition)}>
              <Icon name="arrow" size={15} /> Voltar à linha do tempo
            </button>
          </div>
        </article>
      )}
    </>
  );
}
