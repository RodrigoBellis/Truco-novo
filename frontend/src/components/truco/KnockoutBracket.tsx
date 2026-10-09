import type { ReactNode } from "react";
import { BRACKET_ROUND_LABEL, knockoutChampion, type BracketRound, type KnockoutKey, type KnockoutMatchView, type KnockoutSideView } from "@truco/shared";
import { OpeningTrophy } from "../opening/OpeningTrophy";
import { useValueChangePulse } from "../../hooks/useValueChangePulse";
import "./KnockoutBracket.css";

interface KnockoutBracketProps {
  championConfirmed?: boolean;
  /** Chaveamento na ordem do plano oficial (buildKnockoutView de @truco/shared). */
  view: KnockoutMatchView[];
  highlightTeamId?: string | null;
  /** Texto ao lado de uma dupla que ainda não está confirmada no confronto. */
  provisionalLabel?: string;
  /** Rodapé de um confronto: o botão de lançar/editar ou o formulário de placar. Sem retorno, o card é só leitura. */
  renderActions?: (match: KnockoutMatchView) => ReactNode;
}

/**
 * Ordem de cima para baixo em cada coluna no desktop. As quartas aparecem invertidas
 * (2 em cima) porque o chaveamento cruza: Repescagem 1 → Quartas 2 → Semifinal 1. Assim cada
 * confronto fica na mesma linha do jogo que o alimenta e os conectores não se cruzam.
 */
const COLUMN_ORDER: Array<{ round: BracketRound; keys: KnockoutKey[] }> = [
  { round: "repescagem", keys: ["R1", "R2"] },
  { round: "quartas", keys: ["Q2", "Q1"] },
  { round: "semifinal", keys: ["S1", "S2"] },
  { round: "final", keys: ["F"] },
];

function Side({ side, played, mine, provisionalLabel }: { side: KnockoutSideView; played: boolean; mine: boolean; provisionalLabel: string }) {
  // A vaga passa do texto de espera para o nome de quem avançou, e o placar sai:
  // são os dois instantes em que algo acontece no chaveamento.
  const nameRef = useValueChangePulse<HTMLDivElement>(side.name ?? "", "rise");
  const setsRef = useValueChangePulse<HTMLSpanElement>(side.sets === null ? "" : String(side.sets), "pop");
  const state = !side.name ? " ko-side-empty" : played ? (side.winner ? " ko-side-winner" : " ko-side-loser") : "";

  return (
    <div className={`ko-side${state}${mine ? " ko-side-mine" : ""}`}>
      <div className="ko-side-team" ref={nameRef}>
        <strong>{side.name ?? side.placeholder}</strong>
        <small>
          {side.name ? side.placeholder : "A definir"}
          {side.provisional && " · " + provisionalLabel}
          {mine && <span className="ko-side-you">Sua dupla</span>}
        </small>
      </div>
      <span className="ko-side-sets" ref={setsRef} aria-label={side.sets === null ? "sem placar" : `${side.sets} sets`}>
        {side.sets ?? "–"}
      </span>
    </div>
  );
}

function MatchCard({ match, highlightTeamId, provisionalLabel, actions }: { match: KnockoutMatchView; highlightTeamId?: string | null; provisionalLabel: string; actions?: ReactNode }) {
  const ready = Boolean(match.sideA.name && match.sideB.name && !match.sideA.provisional && !match.sideB.provisional);
  const status = match.played ? "Encerrado" : ready ? "A jogar" : "Aguardando";
  const isMine = (side: KnockoutSideView) => Boolean(highlightTeamId && side.teamId === highlightTeamId && !side.provisional);
  const statusRef = useValueChangePulse<HTMLSpanElement>(status, "rise");

  return (
    <div className={`ko-cell ko-cell-${match.key}${match.played ? " ko-cell-played" : ""}`}>
      <article className={`ko-match${match.played ? " ko-match-played" : ready ? " ko-match-ready" : ""}`} aria-label={`${match.label}: ${match.sideA.name ?? match.sideA.placeholder} contra ${match.sideB.name ?? match.sideB.placeholder}. ${status}.`}>
        <header className="ko-match-head">
          <span className="ko-match-label">{match.label}{match.sameGroup && ready && <span className="ko-match-rematch">Reencontro do grupo</span>}</span>
          <span className="ko-match-status" ref={statusRef}>{status}</span>
        </header>
        <Side side={match.sideA} played={match.played} mine={isMine(match.sideA)} provisionalLabel={provisionalLabel} />
        <Side side={match.sideB} played={match.played} mine={isMine(match.sideB)} provisionalLabel={provisionalLabel} />
        {actions && <div className="ko-match-actions">{actions}</div>}
      </article>
    </div>
  );
}

/** Chaveamento visual do mata-mata: colunas ligadas por conectores no desktop, trilha vertical no celular. */
export function KnockoutBracket({ view, highlightTeamId, provisionalLabel = "posição de hoje", renderActions, championConfirmed = true }: KnockoutBracketProps) {
  const winner = knockoutChampion(view);
  const champion = championConfirmed ? winner : null;
  const byKey = new Map(view.map((match) => [match.key, match]));

  return (
    <div className="ko">
      <div className="ko-rounds">
        {COLUMN_ORDER.map(({ round, keys }) => (
          <section key={round} className={`ko-round ko-round-${round}`} aria-label={BRACKET_ROUND_LABEL[round]}>
            <h3 className="ko-round-title">{BRACKET_ROUND_LABEL[round]}</h3>
            <div className="ko-round-matches">
              {keys.map((key) => {
                const match = byKey.get(key);
                return match ? <MatchCard key={key} match={match} highlightTeamId={highlightTeamId} provisionalLabel={provisionalLabel} actions={renderActions?.(match)} /> : null;
              })}
            </div>
          </section>
        ))}

        <section className="ko-round ko-round-champion" aria-label="Campeão">
          <h3 className="ko-round-title">Campeão</h3>
          <div className="ko-round-matches">
            <div className={`ko-champion${champion ? " ko-champion-decided" : ""}`} key={champion?.teamId ?? "pending"}>
              <div className="ko-champion-trophy" aria-hidden="true"><OpeningTrophy /></div>
              <p className="ko-champion-name">{champion?.name ?? (winner ? "Registro pendente" : "A definir")}</p>
              <p className="ko-champion-note">{champion ? "Campeão da 5ª edição" : winner ? "Final salva; título em confirmação" : "Vencedor da Final"}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
