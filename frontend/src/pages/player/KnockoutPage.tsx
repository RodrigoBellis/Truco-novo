import { BRACKET_ROUNDS, BRACKET_ROUND_LABEL } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { KnockoutBracket } from "../../components/truco/KnockoutBracket";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { loadKnockoutData, quarterfinalRematchNote, summarizeKnockout, type KnockoutPhase } from "../../utils/knockout";
import "./KnockoutPage.css";

const PHASES: Array<{ id: KnockoutPhase; label: string }> = [
  { id: "grupos", label: "Fase de grupos" },
  ...BRACKET_ROUNDS.map((round) => ({ id: round as KnockoutPhase, label: BRACKET_ROUND_LABEL[round] })),
];

const PHASE_NOTE: Record<KnockoutPhase, string> = {
  grupos: "O chaveamento é montado quando os dois grupos terminarem.",
  repescagem: "Repescagem em disputa. Quando as duas terminarem, cada vencedor pega nas quartas o 2º colocado do outro grupo, sempre que possível.",
  quartas: "Quartas de final em disputa: quem vencer enfrenta os líderes dos grupos.",
  semifinal: "Semifinais em disputa: os vencedores decidem o título.",
  final: "Só falta a final.",
  encerrado: "Campeonato encerrado.",
};

export function KnockoutPage() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useFetchData(loadKnockoutData);
  useRealtimeMatches(refetch);

  if (isLoading) return <Loading fullHeight label="Carregando o mata-mata..." />;
  if (error || !data) {
    return (
      <div className="page-enter">
        <PageHeader title="Mata-mata" subtitle="Repescagem, quartas, semifinais e final da 5ª Edição" />
        <EmptyState icon={<Icon name="bracket" size={36} />} tone="danger" title="Não foi possível carregar o mata-mata" description={error ?? ""} />
      </div>
    );
  }

  const summary = summarizeKnockout(data);
  const currentIndex = summary.phase === "encerrado" ? PHASES.length : PHASES.findIndex((phase) => phase.id === summary.phase);
  const note = summary.tiePending
    ? "Fase de grupos encerrada com empate em todos os critérios de desempate. O chaveamento sai assim que o administrador decidir as posições."
    : summary.phase === "grupos" && summary.groupsComplete
      ? "Fase de grupos encerrada. Os confrontos abaixo seguem a classificação final e começam assim que o administrador confirmar o mata-mata."
    : summary.provisional
      ? "Chaveamento provisório: mostra quem ocupa cada posição hoje. As vagas só ficam definidas quando a fase de grupos terminar."
      : PHASE_NOTE[summary.phase];
  const rematchNote = quarterfinalRematchNote(summary.view);

  return (
    <div className="page-enter knockout-page">
      <PageHeader title="Mata-mata" subtitle="Repescagem, quartas, semifinais e final da 5ª Edição" />

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

      <KnockoutBracket view={summary.view} highlightTeamId={user?.teamId} provisionalLabel={summary.groupsComplete && !summary.tiePending ? "aguardando confirmação" : undefined} />

      <section className="knockout-rules" aria-labelledby="knockout-rules-title">
        <h2 id="knockout-rules-title">Como cada posição do grupo entra</h2>
        <ul>
          <li className="knockout-rule-semifinal"><strong>1º lugar</strong> direto na semifinal</li>
          <li className="knockout-rule-quartas"><strong>2º lugar</strong> direto nas quartas de final</li>
          <li className="knockout-rule-repescagem"><strong>3º e 4º</strong> jogam a repescagem, cruzando os grupos; quem vence evita, nas quartas, o 2º do próprio grupo</li>
          <li className="knockout-rule-eliminado"><strong>5º lugar</strong> eliminado</li>
        </ul>
      </section>
    </div>
  );
}
