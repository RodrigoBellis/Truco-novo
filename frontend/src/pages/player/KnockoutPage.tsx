import { useEffect, useMemo } from "react";
import { BRACKET_ROUNDS, BRACKET_ROUND_LABEL, RESULTS_LOCKED_MESSAGE, type KnockoutMatchView } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { Button } from "../../components/ui/Button";
import { ScoreForm } from "../../components/truco/ScoreForm";
import { KnockoutBracket } from "../../components/truco/KnockoutBracket";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { useResultsLock } from "../../hooks/useResultsLock";
import { useResultEntry } from "../../hooks/useResultEntry";
import { knockoutResultToast, loadKnockoutData, quarterfinalRematchNote, summarizeKnockout, teamKnockoutStatus, type KnockoutPhase } from "../../utils/knockout";
import "./KnockoutPage.css";
import "../../components/truco/ResultsLockControl.css";

const PHASES: Array<{ id: KnockoutPhase; label: string }> = [
  { id: "grupos", label: "Fase de grupos" },
  ...BRACKET_ROUNDS.map((round) => ({ id: round as KnockoutPhase, label: BRACKET_ROUND_LABEL[round] })),
];

const PHASE_NOTE: Record<KnockoutPhase, string> = {
  grupos: "A repescagem começa sozinha quando os dois grupos terminarem.",
  repescagem: "Repescagem em disputa: as duplas lançam o resultado aqui mesmo. Quando as duas terminarem, cada vencedor pega nas quartas o 2º colocado do outro grupo, sempre que possível.",
  quartas: "Quartas de final em disputa: quem vencer enfrenta os líderes dos grupos.",
  semifinal: "Semifinais em disputa: os vencedores decidem o título.",
  final: "Só falta a final.",
  encerrado: "Campeonato encerrado.",
};

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
        <PageHeader title="Mata-mata" subtitle="Repescagem, quartas, semifinais e final da 5ª Edição" />
        <EmptyState icon={<Icon name="bracket" size={36} />} tone="danger" title="Não foi possível carregar o mata-mata" description={error ?? ""} />
      </div>
    );
  }

  const currentIndex = summary.phase === "encerrado" ? PHASES.length : PHASES.findIndex((phase) => phase.id === summary.phase);
  const note = data.status?.syncPending
    ? "Os placares salvos foram preservados. O avanço automático está pendente; não reenvie resultados."
    : summary.tiePending
    ? "Fase de grupos encerrada com empate em todos os critérios de desempate. O chaveamento sai assim que o administrador decidir as posições."
    : summary.phase === "grupos" && summary.groupsComplete
      ? "Fase de grupos encerrada: a repescagem já está valendo e os confrontos abaixo seguem a classificação final. O botão de lançar resultado aparece assim que os jogos entram no chaveamento."
    : summary.provisional
      ? "Chaveamento provisório: mostra quem ocupa cada posição hoje. As vagas só ficam definidas quando a fase de grupos terminar."
      : PHASE_NOTE[summary.phase];
  const rematchNote = quarterfinalRematchNote(summary.view);

  const myTeamId = user?.role === "jogador" ? (user.teamId ?? null) : null;
  const myTeam = myTeamId ? data.teams.find((team) => team.id === myTeamId) : undefined;
  const campaign = teamKnockoutStatus(summary, data, myTeamId);
  const editionOver = data.status?.editionFinished === true;
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
      <PageHeader title="Mata-mata" subtitle="Repescagem, quartas, semifinais e final da 5ª Edição" />

      {resultsLock.locked && !resultsLock.isLoading && !editionOver && (
        <p className="results-lock-notice" role="status"><Icon name="lock" size={20} />{RESULTS_LOCKED_MESSAGE}</p>
      )}

      {campaign && (campaign.headline || campaign.turn || campaign.waiting) && (
        <section className={`knockout-campaign knockout-campaign-${campaign.outcome ?? "running"}`} aria-label="Sua dupla no mata-mata">
          {campaign.headline && (
            // A chave refaz a entrada quando a dupla passa de fase.
            <div className="knockout-campaign-result" key={campaign.headline}>
              <span className="knockout-campaign-icon" aria-hidden="true"><Icon name={campaign.outcome === "champion" ? "trophy" : campaign.outcome === "advanced" ? "check" : "bracket"} size={22} /></span>
              <div>
                <h2 className="knockout-campaign-headline">{campaign.headline}</h2>
                {campaign.detail && <p className="knockout-campaign-detail">{campaign.detail}</p>}
              </div>
            </div>
          )}
          {campaign.turn && (
            <div className="knockout-campaign-turn">
              <span className="knockout-campaign-label">Sua vez</span>
              <p className="knockout-campaign-opponent">{campaign.turn.match.label} · contra <strong>{campaign.turn.opponentName}</strong></p>
              {resultAction(campaign.turn.match, "top")}
            </div>
          )}
          {campaign.waiting && <p className="knockout-campaign-waiting">{campaign.waiting.sentence}</p>}
        </section>
      )}

      <section className="knockout-path" aria-label="Caminho até o título">
        <ol>
          {PHASES.map((phase, index) => (
            <li key={phase.id} className={index < currentIndex ? "knockout-step-done" : index === currentIndex ? "knockout-step-current" : undefined} aria-current={index === currentIndex ? "step" : undefined}>
              {phase.label}
            </li>
          ))}
        </ol>
        <p role="status">{note}</p>
        {rematchNote && <p className="knockout-rematch-note">{rematchNote}</p>}
      </section>

      <KnockoutBracket view={summary.view} championConfirmed={editionOver} highlightTeamId={user?.teamId} provisionalLabel={summary.groupsComplete && !summary.tiePending ? "classificação final" : undefined} renderActions={(match) => resultAction(match, "card")} />

      <section className="knockout-rules" aria-labelledby="knockout-rules-title">
        <h2 id="knockout-rules-title">Como cada posição do grupo entra</h2>
        <ul>
          <li className="knockout-rule-semifinal"><strong>1º lugar</strong> direto na semifinal</li>
          <li className="knockout-rule-quartas"><strong>2º lugar</strong> direto nas quartas de final</li>
          <li className="knockout-rule-repescagem"><strong>3º e 4º</strong> jogam a repescagem, cruzando os grupos; quem vence evita, nas quartas, o 2º do próprio grupo</li>
          <li className="knockout-rule-eliminado"><strong>5º lugar</strong> eliminado</li>
        </ul>
        <p>Cada fase nasce sozinha: a repescagem com o fim dos grupos, as quartas com as duas repescagens encerradas, e assim até a final. Quem joga a partida lança o resultado aqui no chaveamento ou em Jogos; o vencedor avança na hora.</p>
      </section>

      {entry.dialog}
    </div>
  );
}
