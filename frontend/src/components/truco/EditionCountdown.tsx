import { useEffect, useState } from "react";
import type { DashboardChampion } from "@truco/shared";
import { Icon } from "../ui/Icon";
import { EDITION_START, EDITION_START_MS, EDITION_STATUS_LABEL, EDITION_STATUS_PHRASE, countdownParts, editionStatus, formatEditionStart } from "../../utils/editionSchedule";
import "./EditionCountdown.css";

interface EditionCountdownProps {
  /** Cadeado de resultados do Admin (useResultsLock): a faixa só exibe, nunca decide permissão. */
  locked: boolean;
  /** Campeão oficial; ausente quando não há ou quando o painel não pôde ser consultado. */
  champion?: DashboardChampion | null;
}

/**
 * Relógio da contagem: um tique por segundo, alinhado à virada do segundo, e nenhum timer depois
 * que o horário chega. Só troca o texto dos números; não há animação CSS envolvida.
 */
function useNowUntil(target: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      const current = Date.now();
      if (current >= target) return;
      timer = window.setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, 1000 - (current % 1000));
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [target]);
  return now;
}

const two = (value: number) => String(value).padStart(2, "0");

/** Faixa "Rumo ao campeonato": data, contagem até o início, situação da edição e cadeado. */
export function EditionCountdown({ locked, champion }: EditionCountdownProps) {
  const now = useNowUntil(EDITION_START_MS);
  const status = editionStatus({ now, locked, champion });
  const left = status === "aguardando-inicio" ? countdownParts(now) : null;
  const statusMark = <p className={`home-road-status home-road-status-${status}`} data-status={status}><i aria-hidden="true" />{EDITION_STATUS_LABEL[status]}</p>;
  return (
    <section className={`home-road${left ? " home-road-counting" : ""}`} aria-labelledby="home-road-title">
      <div className="home-road-head">
        <h2 id="home-road-title">Rumo ao campeonato</h2>
        <p className="home-road-date"><time dateTime={EDITION_START}>{formatEditionStart()}</time></p>
        {left && statusMark}
      </div>

      {left ? (
        <div className="home-road-clock" role="timer" aria-label="Tempo até o início">
          <span><b>{left.days}</b><small>{left.days === 1 ? "dia" : "dias"}</small></span>
          <span><b>{two(left.hours)}</b><small>{left.hours === 1 ? "hora" : "horas"}</small></span>
          <span><b>{two(left.minutes)}</b><small>min</small></span>
          <span><b>{two(left.seconds)}</b><small>seg</small></span>
        </div>
      ) : (
        <div className="home-road-state">
          {statusMark}
          {status === "encerrado" && champion?.teamName && <p className="home-road-champion"><Icon name="trophy" size={16} />{champion.teamName}</p>}
        </div>
      )}

      <div className="home-road-foot">
        <p className="home-road-phrase">{EDITION_STATUS_PHRASE[status]}</p>
        <p className={`home-road-lock ${locked ? "is-locked" : "is-open"}`}><Icon name={locked ? "lock" : "unlock"} size={16} />{locked ? "Resultados bloqueados" : "Resultados liberados"}</p>
      </div>
    </section>
  );
}
