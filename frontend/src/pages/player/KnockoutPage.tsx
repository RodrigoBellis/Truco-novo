import { useEffect, useMemo, useState } from "react";
import { EDITION_PRIZES, RESULTS_LOCKED_MESSAGE, knockoutChampion, knockoutThirdPlace, type BracketRound, type KnockoutMatchView } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { Button } from "../../components/ui/Button";
import { ScoreForm } from "../../components/truco/ScoreForm";
import { KnockoutBracket, type KnockoutFocus, type KnockoutTab } from "../../components/truco/KnockoutBracket";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { useResultsLock } from "../../hooks/useResultsLock";
import { useResultEntry } from "../../hooks/useResultEntry";
import { knockoutResultToast, loadKnockoutData, summarizeKnockout, teamKnockoutStatus, type KnockoutPhase, type TeamKnockoutStatus } from "../../utils/knockout";
import "./KnockoutPage.css";
import "../../components/truco/ResultsLockControl.css";

/** Barra de fases: quatro etapas. A disputa de 3º lugar sai das semifinais, ao lado da final. */
const STEPS = ["Fase de grupos", "Quartas", "Semifinais", "Final"] as const;
const STEP_INDEX: Record<KnockoutPhase, number> = { grupos: 0, quartas: 1, semifinal: 2, terceiro: 3, final: 3, encerrado: 4 };

/** Confrontos que a fase do momento destaca. Na fase de grupos, as quartas são a próxima etapa. */
const CURRENT_ROUNDS: Record<KnockoutPhase, BracketRound[]> = {
  grupos: ["quartas"], quartas: ["quartas"], semifinal: ["semifinal"], terceiro: ["final", "terceiro"], final: ["final"], encerrado: [],
};

const PHASE_TAB: Record<KnockoutPhase, KnockoutTab> = { grupos: "quartas", quartas: "quartas", semifinal: "semifinal", terceiro: "final", final: "final", encerrado: "final" };

const FILTERS: Array<{ id: KnockoutFocus; label: string }> = [
  { id: "geral", label: "Visão geral" },
  { id: "fase", label: "Fase atual" },
  { id: "dupla", label: "Minha dupla" },
];

const FOCUS_KEY = "truco-do-novo:mata-mata-filtro";

function readFocus(): KnockoutFocus {
  try {
    const saved = localStorage.getItem(FOCUS_KEY);
    return saved === "fase" || saved === "dupla" ? saved : "geral";
  } catch {
    return "geral";
  }
}

/** Situação da dupla numa palavra, lida só do que o chaveamento já decidiu. */
function campaignBadge(campaign: TeamKnockoutStatus): { label: string; tone: string } {
  if (campaign.outcome === "champion") return { label: "Campeã", tone: "gold" };
  if (campaign.outcome === "podium") return { label: "No pódio", tone: "gold" };
  if (campaign.outcome === "eliminated") return { label: "Eliminada", tone: "out" };
  if (campaign.turn) return { label: "Em disputa", tone: "live" };
  if (campaign.waiting) return { label: "Aguardando adversário", tone: "wait" };
  return { label: "Classificada", tone: "live" };
}

/** Zona da posição na tabela do grupo único: 1º e 2º semifinal, 3º a 6º quartas, 7º fora. */
const zoneOf = (position: number) => (position <= 2 ? "vaga direta na semifinal" : position <= 6 ? "vaga nas quartas" : "fora do mata-mata");

const PHASE_NOTE: Record<KnockoutPhase, string> = {
  grupos: "As quartas de final começam sozinhas quando os 21 jogos do grupo terminarem.",
  quartas: "Quartas de final em disputa: quem vencer enfrenta o 1º ou o 2º colocado na semifinal.",
  semifinal: "Semifinais em disputa: quem vence vai à final; quem perde disputa o 3º lugar.",
  terceiro: "Final e disputa de 3º lugar liberadas. O campeonato termina quando as duas tiverem resultado.",
  final: "Só falta a final.",
  encerrado: "Campeonato encerrado.",
};

const SUBTITLE = "Quartas, semifinais, final e disputa de 3º lugar da 5ª Edição";
const brl = (value: number) => `R$ ${value}`;

export function KnockoutPage() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useFetchData(loadKnockoutData);
  useRealtimeMatches(refetch);
  useEffect(() => {
    if (!data?.status?.syncPending) return;
    const timer = setInterval(refetch, 3_000);
    return () => clearInterval(timer);
  }, [data?.status?.syncPending, refetch]);
  // Cadeado global: fechado, o chaveamento é só leitura.
  const resultsLock = useResultsLock();
  // Filtro do chaveamento: só muda o destaque, lembrado neste navegador.
  const [focus, setFocus] = useState<KnockoutFocus>(readFocus);
  const chooseFocus = (next: KnockoutFocus) => {
    setFocus(next);
    try { localStorage.setItem(FOCUS_KEY, next); } catch { /* sem armazenamento: vale só nesta visita */ }
  };
  const summary = useMemo(() => (data ? summarizeKnockout(data) : null), [data]);
  // Mesmo fluxo de lançar/corrigir da tela Jogos (confirmação, toasts, 403).
  const entry = useResultEntry({
    onSaved: refetch,
    onForbidden: () => { resultsLock.refetch(); refetch(); },
    successMessage: (target, result) => {
      const match = summary?.view.find((item) => summary.matchIds[item.key] === target.matchId);
      return match ? knockoutResultToast(match, user?.teamId, result) : null;
    },
  });

  if (isLoading && !data) return <Loading fullHeight label="Carregando o mata-mata..." />;
  if (error || !data || !summary) {
    return (
      <div className="page-enter">
        <PageHeader title="Mata-mata" subtitle={SUBTITLE} />
        <EmptyState icon={<Icon name="bracket" size={36} />} tone="danger" title="Não foi possível carregar o mata-mata" description={error ?? ""} />
      </div>
    );
  }

  const currentIndex = STEP_INDEX[summary.phase];
  const note = data.status?.syncPending
    ? "Os placares salvos foram preservados. O avanço automático está pendente; não reenvie resultados."
    : summary.tiePending
    ? "Fase de grupos encerrada com empate em todos os critérios de desempate. O chaveamento sai assim que o administrador decidir as posições."
    : summary.phase === "grupos" && summary.groupsComplete
      ? "Fase de grupos encerrada: as quartas já estão valendo e os confrontos abaixo seguem a classificação final. O botão de lançar resultado aparece assim que os jogos entram no chaveamento."
    : summary.provisional
      ? "Chaveamento provisório: mostra quem ocupa cada posição hoje. As vagas só ficam definidas quando a fase de grupos terminar."
      : PHASE_NOTE[summary.phase];
  const final = summary.view.find((match) => match.round === "final");
  const champion = data.status?.champion ? knockoutChampion(summary.view) : null;
  const runnerUp = champion && final ? (final.sideA.winner ? final.sideB : final.sideA) : null;
  const thirdPlace = knockoutThirdPlace(summary.view);
  const thirdMatch = summary.view.find((match) => match.round === "terceiro");
  const podium = [
    { place: "1º", title: "Campeões", prize: EDITION_PRIZES.campeao, side: champion, match: final },
    { place: "2º", title: "Vice-campeões", prize: EDITION_PRIZES.vice, side: runnerUp, match: final },
    { place: "3º", title: "Terceiro lugar", prize: EDITION_PRIZES.terceiro, side: thirdPlace, match: thirdMatch },
  ];

  const myTeamId = user?.role === "jogador" ? (user.teamId ?? null) : null;
  const myTeam = myTeamId ? data.teams.find((team) => team.id === myTeamId) : undefined;
  const campaign = teamKnockoutStatus(summary, data, myTeamId);
  const editionOver = data.status?.editionFinished === true;
  const activeFocus: KnockoutFocus = focus === "dupla" && !myTeamId ? "geral" : focus;
  // Disputa de 3º lugar: liberada com as semifinais, decidida quando tem placar.
  const thirdState = thirdMatch?.played ? "done" : summary.phase === "terceiro" ? "current" : "future";
  const inBracket = Boolean(myTeamId && summary.view.some((match) => [match.sideA, match.sideB].some((side) => side.teamId === myTeamId && !side.provisional)));
  const myRow = myTeamId ? data.standings.A?.find((row) => row.teamId === myTeamId) : undefined;
  const groupsRunning = summary.phase === "grupos";
  // Aba do celular: a da fase atual, ou a do jogo da dupla quando o filtro é "Minha dupla".
  const myMatch = campaign?.turn?.match ?? campaign?.waiting?.match;
  const tab: KnockoutTab = activeFocus === "dupla" && myMatch ? myMatch.round : PHASE_TAB[summary.phase];
  const badge = campaign ? campaignBadge(campaign) : null;
  const matchIds = summary.matchIds;

  /**
   * Botão ou formulário de placar de um confronto. Só para integrante de uma das duas duplas,
   * com o jogo criado, a dupla aprovada, o cadeado aberto e a edição em disputa. A API confere
   * tudo de novo; aqui é só para não oferecer o que ela vai recusar.
   */
  function resultAction(match: KnockoutMatchView, place: "top" | "card") {
    const matchId = matchIds[match.key];
    const playsIt = [match.sideA, match.sideB].some((side) => side.teamId === myTeamId && !side.provisional);
    if (!matchId || !myTeamId || !playsIt || myTeam?.status !== "aprovada" || resultsLock.locked || editionOver || data?.status?.syncPending) return null;
    const key = place + ":" + matchId;
    if (entry.openKey !== key) {
      return (
        <Button variant={match.played ? "ghost" : "primary"} size="sm" onClick={() => entry.open(key)}>
          {match.played ? "Editar resultado" : "Lançar resultado"}
        </Button>
      );
    }
    return (
      <ScoreForm
        teamAName={match.sideA.name ?? match.sideA.placeholder}
        teamBName={match.sideB.name ?? match.sideB.placeholder}
        isSubmitting={entry.isSubmitting}
        currentResult={match.played && match.sideA.sets !== null && match.sideB.sets !== null ? { setsA: match.sideA.sets, setsB: match.sideB.sets } : null}
        onCancel={entry.close}
        onSubmit={(result) => entry.submit({ matchId, stage: "mata-mata", hasResult: match.played }, result)}
      />
    );
  }

  return (
    <div className="page-enter knockout-page">
      <PageHeader title="Mata-mata" subtitle={SUBTITLE} />

      {resultsLock.locked && !resultsLock.isLoading && !editionOver && (
        <p className="results-lock-notice" role="status"><Icon name="lock" size={20} />{RESULTS_LOCKED_MESSAGE}</p>
      )}

      <section className="knockout-path" aria-label="Caminho até o título">
        <div className="knockout-path-head">
          <span className="knockout-path-kicker">{summary.phase === "encerrado" ? "Campeonato encerrado" : "Fase atual"}</span>
          {groupsRunning && !summary.tiePending && <span className="knockout-provisional-badge">Provisório até o fim dos grupos</span>}
        </div>
        <ol className="knockout-steps">
          {STEPS.map((label, index) => (
            <li key={label} className={index < currentIndex ? "knockout-step-done" : index === currentIndex ? "knockout-step-current" : "knockout-step-next"} aria-current={index === currentIndex ? "step" : undefined}>
              <span className="knockout-step-dot" aria-hidden="true">{index < currentIndex ? "✓" : index + 1}</span>
              <span className="knockout-step-label">{label}</span>
            </li>
          ))}
        </ol>
        <p className={`knockout-third-branch knockout-third-${thirdState}`}>
          3º lugar: perdedores das semifinais, junto com a final{thirdState === "done" ? " · decidido" : thirdState === "current" ? " · em disputa" : ""}
        </p>
        <p className="knockout-path-note" role="status">{note}</p>
      </section>

      {myTeamId && (campaign || groupsRunning) && (
        <section className={`knockout-campaign knockout-campaign-${campaign?.outcome ?? "running"}`} aria-label="Sua dupla no mata-mata">
          <div className="knockout-campaign-team">
            <span className="knockout-campaign-kicker">Sua dupla</span>
            {myTeam?.name && <strong className="knockout-campaign-name">{myTeam.name}</strong>}
            <span className={`knockout-campaign-badge knockout-badge-${badge?.tone ?? "wait"}`}>{badge?.label ?? "Fase de grupos"}</span>
          </div>
          {campaign?.headline && (
            // A chave refaz a entrada quando a dupla passa de fase.
            <div className="knockout-campaign-result" key={campaign.headline}>
              <span className="knockout-campaign-icon" aria-hidden="true"><Icon name={campaign.outcome === "champion" || campaign.outcome === "podium" ? "trophy" : campaign.outcome === "advanced" ? "check" : "bracket"} size={22} /></span>
              <div>
                <h2 className="knockout-campaign-headline">{campaign.headline}</h2>
                {campaign.detail && <p className="knockout-campaign-detail">{campaign.detail}</p>}
              </div>
            </div>
          )}
          {campaign?.turn && (
            <div className="knockout-campaign-turn">
              <span className="knockout-campaign-label">Sua vez</span>
              <p className="knockout-campaign-opponent">{campaign.turn.match.label} · contra <strong>{campaign.turn.opponentName}</strong></p>
              {resultAction(campaign.turn.match, "top")}
            </div>
          )}
          {campaign?.waiting && <p className="knockout-campaign-waiting">{campaign.waiting.sentence}</p>}
          {!campaign && (
            <p className="knockout-campaign-waiting">
              {myRow && myRow.jogos > 0
                ? `Hoje em ${myRow.position}º lugar no grupo: ${zoneOf(myRow.position)}. A vaga só fica garantida no fim da fase de grupos.`
                : "A vaga da sua dupla no chaveamento é definida no fim da fase de grupos."}
            </p>
          )}
        </section>
      )}

      <section className="knockout-board" aria-label="Chaveamento">
        <div className="knockout-filters" role="radiogroup" aria-label="Destaque do chaveamento">
          {FILTERS.filter((item) => item.id !== "dupla" || myTeamId).map((item) => (
            <button key={item.id} type="button" role="radio" aria-checked={activeFocus === item.id} className="knockout-filter" onClick={() => chooseFocus(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        {activeFocus === "dupla" && !inBracket && (
          <p className="knockout-focus-note" role="status">
            {campaign?.outcome === "eliminated"
              ? "Sua dupla terminou a fase de grupos fora das vagas e não está no chaveamento desta edição."
              : "Sua dupla ainda não tem vaga confirmada: o caminho aparece aqui quando a fase de grupos terminar."}
          </p>
        )}
        {activeFocus === "fase" && summary.phase === "encerrado" && <p className="knockout-focus-note" role="status">Campeonato encerrado: não há confronto em disputa.</p>}

        <KnockoutBracket
          view={summary.view}
          championConfirmed={Boolean(data.status?.champion)}
          highlightTeamId={user?.teamId}
          provisionalLabel={summary.groupsComplete && !summary.tiePending ? "classificação final" : undefined}
          renderActions={(match) => resultAction(match, "card")}
          currentRounds={CURRENT_ROUNDS[summary.phase]}
          currentLabel={groupsRunning ? "Próxima fase" : "Em disputa"}
          focus={activeFocus}
          initialTab={tab}
        />
      </section>

      <section className="knockout-podium" aria-labelledby="knockout-podium-title">
        <h2 id="knockout-podium-title">Pódio e premiação</h2>
        <ol>
          {podium.map((item) => {
            const score = item.side && item.match?.played ? `${Math.max(item.match.sideA.sets ?? 0, item.match.sideB.sets ?? 0)}x${Math.min(item.match.sideA.sets ?? 0, item.match.sideB.sets ?? 0)}` : null;
            return (
              <li key={item.place} className={`knockout-podium-item knockout-podium-${item.place.charAt(0)}${item.side ? " is-decided" : ""}`}>
                <span className="knockout-podium-place">{item.place}</span>
                <p className="knockout-podium-title">{item.title}</p>
                <p className="knockout-podium-prize">{brl(item.prize)} <small>por dupla</small></p>
                <p className="knockout-podium-team">{item.side?.name ?? "A definir"}</p>
                {score && <p className="knockout-podium-score">{item.match!.label} · {score}</p>}
              </li>
            );
          })}
        </ol>
      </section>

      <details className="knockout-rules-box">
        <summary>Como funciona o chaveamento</summary>
        <section className="knockout-rules" aria-labelledby="knockout-rules-title">
          <h2 id="knockout-rules-title">Como cada posição do grupo entra</h2>
          <ul>
            <li className="knockout-rule-semifinal"><strong>1º e 2º</strong> direto na semifinal</li>
            <li className="knockout-rule-quartas"><strong>3º a 6º</strong> jogam as quartas: 3º × 6º e 4º × 5º</li>
            <li className="knockout-rule-eliminado"><strong>7º lugar</strong> eliminado</li>
          </ul>
          <p>Na semifinal, o 1º enfrenta o vencedor de 4º × 5º e o 2º enfrenta o vencedor de 3º × 6º. Quem vence vai à final; quem perde disputa o 3º lugar.</p>
          <p>Cada fase nasce sozinha: as quartas com o fim do grupo, as semifinais com as quartas, e a final e a disputa de 3º lugar com as duas semifinais. Quem joga a partida lança o resultado aqui no chaveamento ou em Jogos; o vencedor avança na hora.</p>
        </section>
      </details>

      {entry.dialog}
    </div>
  );
}
