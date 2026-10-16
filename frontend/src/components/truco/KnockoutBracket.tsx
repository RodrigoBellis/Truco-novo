import { useEffect, useState, type ReactNode } from "react";
import { BRACKET_ROUND_LABEL, EDITION_PRIZES, knockoutChampion, type BracketRound, type KnockoutKey, type KnockoutMatchView, type KnockoutSideView } from "@truco/shared";
import { OpeningTrophy } from "../opening/OpeningTrophy";
import { useValueChangePulse } from "../../hooks/useValueChangePulse";
import "./KnockoutBracket.css";

/** Como o chaveamento é lido: tudo igual, só a fase em disputa, ou só o caminho da dupla. */
export type KnockoutFocus = "geral" | "fase" | "dupla";

/** Abas do celular: uma fase por vez. A disputa de 3º lugar tem aba própria. */
export type KnockoutTab = "quartas" | "semifinal" | "final" | "terceiro";

interface KnockoutBracketProps {
  championConfirmed?: boolean;
  /** Chaveamento na ordem do plano oficial (buildKnockoutView de @truco/shared). */
  view: KnockoutMatchView[];
  highlightTeamId?: string | null;
  /** Texto ao lado de uma dupla que ainda não está confirmada no confronto. */
  provisionalLabel?: string;
  /** Rodapé de um confronto: o botão de lançar/editar ou o formulário de placar. Sem retorno, o card é só leitura. */
  renderActions?: (match: KnockoutMatchView) => ReactNode;
  /** Fases em disputa agora: os confrontos delas ganham o destaque laranja. */
  currentRounds?: readonly BracketRound[];
  /** Leitura escolhida nos filtros. Só muda o destaque; nada some do chaveamento. */
  focus?: KnockoutFocus;
  /** Aba aberta primeiro no celular (a da fase em disputa). Muda junto com a fase. */
  initialTab?: KnockoutTab;
  /** Selo das fases destacadas: "Em disputa", ou "Próxima fase" enquanto o grupo não termina. */
  currentLabel?: string;
}

/**
 * Ordem de cima para baixo em cada coluna no desktop. As quartas aparecem invertidas
 * (2 em cima) porque o chaveamento cruza: Quartas 2 → Semifinal 1 e Quartas 1 → Semifinal 2.
 * Assim cada confronto fica na mesma linha do jogo que o alimenta e os conectores não se cruzam.
 * A disputa de 3º lugar fica fora das colunas, logo abaixo do chaveamento.
 */
const COLUMN_ORDER: Array<{ round: BracketRound; keys: KnockoutKey[] }> = [
  { round: "quartas", keys: ["Q2", "Q1"] },
  { round: "semifinal", keys: ["S1", "S2"] },
  { round: "final", keys: ["F"] },
];

const TABS: Array<{ id: KnockoutTab; label: string }> = [
  { id: "quartas", label: "Quartas" },
  { id: "semifinal", label: "Semifinais" },
  { id: "final", label: "Final" },
  { id: "terceiro", label: "3º lugar" },
];

const brl = (value: number) => `R$ ${value}`;

/** A dupla ocupa o lado de verdade (não é só a posição de hoje na fase de grupos). */
const holds = (side: KnockoutSideView, teamId: string | null | undefined) => Boolean(teamId && side.teamId === teamId && !side.provisional);

function Side({ side, played, mine, provisionalLabel }: { side: KnockoutSideView; played: boolean; mine: boolean; provisionalLabel: string }) {
  // A vaga passa do texto de espera para o nome de quem avançou, e o placar sai:
  // são os dois instantes em que algo acontece no chaveamento.
  const nameRef = useValueChangePulse<HTMLDivElement>(side.name ?? "", "rise");
  const setsRef = useValueChangePulse<HTMLSpanElement>(side.sets === null ? "" : String(side.sets), "pop");
  const state = !side.name ? " ko-side-empty" : played ? (side.winner ? " ko-side-winner" : " ko-side-loser") : "";

  return (
    <div className={`ko-side${state}${mine ? " ko-side-mine" : ""}${side.provisional ? " ko-side-provisional" : ""}`}>
      <div className="ko-side-team" ref={nameRef}>
        <strong>{side.name ?? side.placeholder}</strong>
        {(side.name || mine) && (
          <small>
            {side.name && side.placeholder}
            {side.provisional && " · " + provisionalLabel}
            {mine && <span className="ko-side-you">Sua dupla</span>}
          </small>
        )}
      </div>
      {played && side.winner && <span className="ko-side-mark" aria-hidden="true">▲</span>}
      <span className="ko-side-sets" ref={setsRef} aria-label={side.sets === null ? "sem placar" : `${side.sets} sets`}>
        {side.sets ?? "–"}
      </span>
    </div>
  );
}

interface CardProps {
  match: KnockoutMatchView;
  highlightTeamId?: string | null;
  provisionalLabel: string;
  actions?: ReactNode;
  current: boolean;
  focus: KnockoutFocus;
  prize?: string;
}

function MatchCard({ match, highlightTeamId, provisionalLabel, actions, current, focus, prize }: CardProps) {
  const ready = Boolean(match.sideA.name && match.sideB.name && !match.sideA.provisional && !match.sideB.provisional);
  const status = match.played ? "Encerrado" : ready ? "A jogar" : "Aguardando";
  const mine = holds(match.sideA, highlightTeamId) || holds(match.sideB, highlightTeamId);
  const statusRef = useValueChangePulse<HTMLSpanElement>(status, "rise");
  // Filtro: o que não é do recorte fica apagado, mas continua no lugar para o caminho fazer sentido.
  const dim = (focus === "fase" && !current) || (focus === "dupla" && !mine);
  const cell = [
    "ko-cell",
    `ko-cell-${match.key}`,
    match.played && "ko-cell-played",
    current && "ko-cell-current",
    mine && "ko-cell-mine",
    dim && "ko-cell-dim",
  ].filter(Boolean).join(" ");

  return (
    <div className={cell}>
      <article className={`ko-match${match.played ? " ko-match-played" : ready ? " ko-match-ready" : ""}`} aria-label={`${match.label}: ${match.sideA.name ?? match.sideA.placeholder} contra ${match.sideB.name ?? match.sideB.placeholder}. ${status}.`}>
        <header className="ko-match-head">
          <span className="ko-match-label">
            {match.label}
            {match.sameGroup && ready && <span className="ko-match-rematch">Reencontro do grupo</span>}
          </span>
          {prize && <span className="ko-match-prize">{prize}</span>}
          <span className={`ko-match-status ko-status-${match.played ? "done" : ready ? "ready" : "wait"}`} ref={statusRef}>{status}</span>
        </header>
        <Side side={match.sideA} played={match.played} mine={holds(match.sideA, highlightTeamId)} provisionalLabel={provisionalLabel} />
        <Side side={match.sideB} played={match.played} mine={holds(match.sideB, highlightTeamId)} provisionalLabel={provisionalLabel} />
        {actions && <div className="ko-match-actions">{actions}</div>}
      </article>
    </div>
  );
}

/**
 * Chaveamento visual do mata-mata: colunas ligadas por conectores no desktop; no celular,
 * abas por fase ou o chaveamento completo numa trilha vertical, sem rolagem lateral.
 */
export function KnockoutBracket({
  view,
  highlightTeamId,
  provisionalLabel = "posição de hoje",
  renderActions,
  championConfirmed = true,
  currentRounds = [],
  focus = "geral",
  initialTab = "quartas",
  currentLabel = "Em disputa",
}: KnockoutBracketProps) {
  const winner = knockoutChampion(view);
  const champion = championConfirmed ? winner : null;
  const byKey = new Map(view.map((match) => [match.key, match]));
  const [tab, setTab] = useState<KnockoutTab>(initialTab);
  const [complete, setComplete] = useState(false);
  // Quando o campeonato muda de fase, a aba acompanha.
  useEffect(() => setTab(initialTab), [initialTab]);

  const card = (key: KnockoutKey, prize?: string) => {
    const match = byKey.get(key);
    if (!match) return null;
    return (
      <MatchCard
        key={key}
        match={match}
        highlightTeamId={highlightTeamId}
        provisionalLabel={provisionalLabel}
        actions={renderActions?.(match)}
        current={currentRounds.includes(match.round)}
        focus={focus}
        prize={prize}
      />
    );
  };
  const championIsMine = Boolean(champion && highlightTeamId && champion.teamId === highlightTeamId);
  const third = byKey.get("T");

  return (
    <div className={`ko ko-focus-${focus}`} data-tab={tab} data-view={complete ? "completo" : "fase"}>
      <div className="ko-mobile-nav">
        <div className="ko-tabs" role="tablist" aria-label="Fases do mata-mata">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={`ko-tab${currentRounds.includes(item.id) ? " ko-tab-live" : ""}`}
              aria-selected={!complete && tab === item.id}
              onClick={() => { setTab(item.id); setComplete(false); }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className="ko-view-toggle" aria-pressed={complete} onClick={() => setComplete((value) => !value)}>
          {complete ? "Ver por fase" : "Ver chaveamento completo"}
        </button>
      </div>

      <div className="ko-rounds">
        {COLUMN_ORDER.map(({ round, keys }) => (
          <section key={round} className={`ko-round ko-round-${round}${currentRounds.includes(round) ? " ko-round-current" : ""}`} aria-label={BRACKET_ROUND_LABEL[round]}>
            <h3 className="ko-round-title">
              {round === "final" ? "Grande final" : BRACKET_ROUND_LABEL[round]}
              {currentRounds.includes(round) && <span className="ko-round-live">{currentLabel}</span>}
            </h3>
            <div className="ko-round-matches">
              {keys.map((key) => card(key, key === "F" ? `${brl(EDITION_PRIZES.campeao)} · ${brl(EDITION_PRIZES.vice)}` : undefined))}
            </div>
          </section>
        ))}

        <section className="ko-round ko-round-champion" aria-label="Campeão">
          <h3 className="ko-round-title">Campeão</h3>
          <div className="ko-round-matches">
            <div className={`ko-champion${champion ? " ko-champion-decided" : ""}${championIsMine ? " ko-champion-mine" : ""}${focus === "dupla" && !championIsMine ? " ko-cell-dim" : ""}`} key={champion?.teamId ?? "pending"}>
              <div className="ko-champion-stage" aria-hidden="true">
                <span className="ko-champion-halo" />
                <div className="ko-champion-trophy"><OpeningTrophy metal="gold" /></div>
              </div>
              <p className="ko-champion-name">{champion?.name ?? (winner ? "Registro pendente" : "A definir")}</p>
              <p className="ko-champion-note">{champion ? "Campeão da 5ª edição" : winner ? "Final salva; título em confirmação" : "Vencedor da Final"}</p>
              <p className="ko-champion-prize">{brl(EDITION_PRIZES.campeao)} por dupla</p>
            </div>
          </div>
        </section>
      </div>

      {third && (
        <section className={`ko-third${currentRounds.includes("terceiro") ? " ko-round-current" : ""}`} aria-label={BRACKET_ROUND_LABEL.terceiro}>
          <h3 className="ko-round-title">
            {BRACKET_ROUND_LABEL.terceiro}
            <span className="ko-third-from">perdedores das semifinais</span>
            {currentRounds.includes("terceiro") && <span className="ko-round-live">{currentLabel}</span>}
          </h3>
          {card("T", brl(EDITION_PRIZES.terceiro))}
        </section>
      )}
    </div>
  );
}
