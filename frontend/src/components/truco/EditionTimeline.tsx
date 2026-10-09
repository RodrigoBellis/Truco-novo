import { forwardRef, useImperativeHandle, useRef, type FocusEvent, type ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { PlayerAvatar } from "../ui/PlayerAvatar";
import { OpeningTrophy } from "../opening/OpeningTrophy";
import { SuitMark, type Suit } from "../opening/SuitMark";
import { useTimelineScroll } from "../../hooks/useTimelineScroll";
import { duoLabel, editionSuit, hasRegisteredDuo, type EditionChapter } from "../../utils/hallOfFame";
import "./EditionTimeline.css";

/** Naipe da edição e a manilha dele no truco (zap, copas, espadilha, pica-fumo). */
const SUIT_CARD: Record<ReturnType<typeof editionSuit>, { suit: Suit; rank: string }> = {
  "♠": { suit: "spade", rank: "A" },
  "♥": { suit: "heart", rank: "7" },
  "♣": { suit: "club", rank: "4" },
  "♦": { suit: "diamond", rank: "7" },
};

export interface EditionTimelineHandle {
  /** Devolve o foco ao botão de detalhes do capítulo e traz o capítulo para a tela. */
  focusChapter: (edition: number) => void;
}

interface EditionTimelineProps {
  /** Bloco de abertura (selo, `h1`, frase): primeiro quadro da trilha no modo horizontal. */
  intro: ReactNode;
  /** Capítulos em ordem cronológica. */
  chapters: EditionChapter[];
  /** Edição com o detalhe aberto. */
  activeEdition: number | null;
  onOpenDetails: (edition: number) => void;
}

/** Caneco ainda sem dono: só o contorno, sem metal. */
function OutlineTrophy() {
  return (
    <svg className="hof-trophy-outline" viewBox="0 0 320 400" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M72 92C20 88 14 150 52 172C66 180 84 178 96 170" />
      <path d="M248 92C300 88 306 150 268 172C254 180 236 178 224 170" />
      <path d="M68 70C68 150 104 214 160 222C216 214 252 150 252 70" />
      <ellipse cx="160" cy="70" rx="92" ry="16" />
      <path d="M144 222C148 244 150 252 150 262M176 222C172 244 170 252 170 262" />
      <path d="M148 270C146 290 134 300 124 306M172 270C174 290 186 300 196 306" />
      <ellipse cx="160" cy="266" rx="27" ry="9" />
      <path d="M98 308V340A62 10 0 0 0 222 340V308" />
      <ellipse cx="160" cy="308" rx="62" ry="10" />
      <path d="M78 344V366A82 12 0 0 0 242 366V344A82 12 0 0 0 78 344" />
    </svg>
  );
}

function ChapterScene({ chapter }: { chapter: EditionChapter }) {
  const card = SUIT_CARD[editionSuit(chapter.edition)];
  const open = chapter.kind === "open";
  const corner = <><b>{card.rank}</b><SuitMark suit={card.suit} /></>;
  return (
    <div className="hof-scene" aria-hidden="true">
      <span className="hof-scene-halo" />
      <span className="hof-card hof-card-back"><SuitMark suit="spade" /></span>
      {open ? (
        <span className="hof-card hof-card-back hof-card-second"><SuitMark suit="spade" /></span>
      ) : (
        <span className={`hof-card hof-card-face hof-card-second${card.suit === "heart" || card.suit === "diamond" ? " hof-card-warm" : ""}`}>
          <span className="hof-card-corner">{corner}</span>
          <SuitMark suit={card.suit} className="hof-card-pip" />
        </span>
      )}
      <span className="hof-scene-pool" />
      <div className="hof-scene-trophy">
        {open ? <OutlineTrophy /> : <OpeningTrophy metal="gold" plate={`${chapter.edition}ª EDIÇÃO`} />}
      </div>
    </div>
  );
}

/**
 * Linha do tempo do Hall da Fama, organizada só por edições.
 *
 * Desktop largo: a seção prende na tela e a rolagem vertical desliza a trilha na horizontal,
 * com os capítulos alternando acima e abaixo da linha. Celular, tablet, movimento reduzido e
 * histórico curto: trilho vertical com os capítulos empilhados. Quem decide o modo é o CSS
 * (`--hof-mode`); o hook só lê.
 */
export const EditionTimeline = forwardRef<EditionTimelineHandle, EditionTimelineProps>(function EditionTimeline({ intro, chapters, activeEdition, onOpenDetails }, handle) {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const { mode, position, goTo, step, ensureVisible } = useTimelineScroll({ section: sectionRef, pin: pinRef, track: trackRef, list: listRef, fill: fillRef }, chapters.length);
  const pinned = mode === "pinned";

  useImperativeHandle(handle, () => ({
    focusChapter(edition) {
      const index = chapters.findIndex((chapter) => chapter.edition === edition);
      if (index < 0) return;
      const item = listRef.current?.children[index];
      item?.querySelector<HTMLElement>(".hof-chapter-details")?.focus({ preventScroll: true });
      ensureVisible(index);
      goTo(index, "auto");
    },
  }), [chapters, ensureVisible, goTo]);

  function handleFocus(event: FocusEvent<HTMLOListElement>) {
    // Só foco de teclado: no clique o capítulo já está sob o ponteiro e não pode sair dele.
    if (!event.target.matches(":focus-visible")) return;
    const item = event.target.closest("li");
    const index = item ? Array.from(event.currentTarget.children).indexOf(item) : -1;
    if (index >= 0) ensureVisible(index);
  }

  const total = chapters.length;
  const current = chapters[position.index];

  return (
    <section ref={sectionRef} className="hof-timeline" data-pinnable={total >= 3 ? "true" : undefined} aria-label="Linha do tempo das edições">
      <div ref={pinRef} className="hof-pin">
        <div className="hof-backdrop" aria-hidden="true"><span className="hof-beam" /><span className="hof-warmth" /></div>
        <div className="hof-viewport">
          <div ref={trackRef} className="hof-track">
            {intro}
            <div className="hof-story">
            <span className="hof-rail" aria-hidden="true"><span ref={fillRef} className="hof-rail-fill" /></span>
            <ol ref={listRef} className="hof-chapters" onFocus={handleFocus}>
              {chapters.map((chapter, index) => {
                const label = `${chapter.edition}ª Edição`;
                const champions = chapter.kind === "closed" ? chapter.entry.champions : null;
                const registered = champions ? hasRegisteredDuo(champions) : false;
                const active = chapter.edition === activeEdition;
                return (
                  <li key={chapter.edition} className={`hof-chapter hof-chapter-${chapter.kind}${index % 2 ? " hof-chapter-below" : " hof-chapter-above"}`}>
                    {pinned ? (
                      <button type="button" className="hof-dot" data-timeline-dot aria-label={`Ir para a ${chapter.edition}ª edição`} aria-current={position.index === index ? "step" : undefined} onClick={() => goTo(index)}><span /></button>
                    ) : (
                      <span className="hof-dot" data-timeline-dot aria-hidden="true"><span /></span>
                    )}
                    <div className="hof-chapter-card" data-timeline-card>
                      <ChapterScene chapter={chapter} />
                      <h2 className="hof-chapter-title" aria-label={label}>
                        <span className="hof-mask"><span><b>{chapter.edition}ª</b><i>Edição</i></span></span>
                      </h2>
                      <div className="hof-chapter-body">
                        {champions ? (
                          <>
                            <p className="hof-chapter-label"><span className="hof-mask"><span>Campeões</span></span></p>
                            {registered ? (
                              <ul className="hof-duo" aria-label={`Dupla campeã da ${chapter.edition}ª edição`}>
                                {champions.map((name, slot) => (
                                  <li key={`${slot}-${name}`} className="hof-mask"><span><PlayerAvatar name={name} size="sm" /><strong>{name}</strong></span></li>
                                ))}
                              </ul>
                            ) : (
                              <p className="hof-duo-missing"><span className="hof-mask"><span>{duoLabel(champions)}</span></span></p>
                            )}
                            <button type="button" className="hof-chapter-details" aria-label={`Ver detalhes da ${chapter.edition}ª edição`} aria-current={active ? "true" : undefined} onClick={() => onOpenDetails(chapter.edition)}>
                              Ver detalhes <Icon name="arrow" size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="hof-chapter-status"><span className="hof-mask"><span>Em disputa</span></span></p>
                            <p className="hof-chapter-next"><span className="hof-mask"><span>A próxima história será escrita</span></span></p>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            </div>
          </div>
        </div>
        {pinned && current && (
          <div className="hof-controls">
            <button type="button" className="hof-step" aria-label="Edição anterior" disabled={position.atStart} onClick={() => step(-1)}><Icon name="arrow" size={18} /></button>
            <p className="hof-progress"><span>Edição</span> <b>{position.index + 1}</b> <span>de {total}</span></p>
            <button type="button" className="hof-step" aria-label="Próxima edição" disabled={position.atEnd} onClick={() => step(1)}><Icon name="arrow" size={18} /></button>
          </div>
        )}
      </div>
    </section>
  );
});
