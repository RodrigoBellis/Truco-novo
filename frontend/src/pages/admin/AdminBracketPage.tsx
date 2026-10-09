import { Link } from "react-router-dom";
import { useEffect } from "react";
import type { Player } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { KnockoutBracket } from "../../components/truco/KnockoutBracket";
import { MatchGroupsList } from "../../components/truco/MatchGroupsList";
import { ScoreForm } from "../../components/truco/ScoreForm";
import { useFetchData } from "../../hooks/useFetchData";
import { useResultEntry } from "../../hooks/useResultEntry";
import { getPlayers } from "../../services/playersService";
import { loadKnockoutData, quarterfinalRematchNote, summarizeKnockout, type KnockoutData } from "../../utils/knockout";
import { teamLabel } from "../../utils/teamHelpers";
import "./AdminBracketPage.css";

interface Data extends KnockoutData {
  players: Player[];
}

const SUBTITLE = "Repescagem, quartas, semifinais e final da 5ª Edição";

export function AdminBracketPage() {
  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [knockout, players] = await Promise.all([loadKnockoutData(), getPlayers()]);
    return { ...knockout, players };
  });
  useEffect(() => {
    if (!data?.status?.syncPending) return;
    const timer = setInterval(refetch, 3_000);
    return () => clearInterval(timer);
  }, [data?.status?.syncPending, refetch]);
  // Mesmo fluxo de lançar/corrigir das telas do jogador; aqui o toast é o do administrador.
  const entry = useResultEntry({
    onSaved: refetch,
    onForbidden: refetch,
    successMessage: (_target, _result, isEdit) => (isEdit ? "Resultado corrigido com sucesso." : "Resultado registrado com sucesso."),
  });

  if (isLoading && !data) return <Loading fullHeight label="Carregando mata-mata..." />;
  if (error || !data) {
    return (
      <div className="page-enter">
        <PageHeader title="Mata-mata" subtitle={SUBTITLE} />
        <EmptyState icon={<Icon name="bracket" size={36} />} tone="danger" title="Não foi possível carregar o mata-mata" description={error ?? ""} />
      </div>
    );
  }

  const summary = summarizeKnockout(data);
  const generated = data.bracket.length > 0;
  const groupsComplete = summary.groupsComplete;
  const rematchNote = quarterfinalRematchNote(summary.view);

  const note = data.status?.syncPending
    ? "Placar salvo. O avanço ou o registro do título está pendente; o servidor tentará concluir automaticamente. Se persistir, revise a configuração antes de corrigir resultados."
    : generated
    ? summary.phase === "encerrado"
      ? "Todos os confrontos do mata-mata já foram disputados. O campeão está registrado e a edição foi encerrada."
      : rematchNote ?? "As fases nascem sozinhas: cada resultado promove o vencedor, as quartas são montadas quando as duas repescagens terminam e a final registra o campeão. As duplas lançam os próprios resultados; aqui você pode registrar ou corrigir um placar."
    : summary.tiePending
      ? "Há empate que sobreviveu a todos os critérios (pontos, vitórias, vitórias por 2x0, confronto direto e saldo de quedas). A repescagem nasce sozinha logo depois que você decidir as posições."
      : groupsComplete
        ? "Fase de grupos encerrada. A repescagem nasce sozinha a partir da classificação final: não é preciso gerar nada. Os confrontos abaixo já seguem essa ordem."
        : "Chaveamento provisório, pela classificação de hoje. A repescagem nasce sozinha quando todos os jogos de grupo terminarem; o administrador só precisa manter o cadeado de resultados aberto.";

  return (
    <div className="page-enter">
      <PageHeader title="Mata-mata" subtitle={SUBTITLE} />

      <p className="admin-bracket-note" role="status">{note}</p>

      {(data.status?.anomalies?.length ?? 0) > 0 && (
        <div className="admin-bracket-note admin-bracket-anomaly" role="alert">
          <strong>O avanço automático parou: o estado do mata-mata não corresponde às regras e nada foi alterado.</strong>
          <ul>{(data.status?.anomalies ?? []).map((anomaly) => <li key={anomaly}>{anomaly}</li>)}</ul>
          Confira os placares citados antes de corrigir qualquer resultado.
        </div>
      )}

      {!generated && summary.tiePending && (
        <p className="admin-bracket-tie">
          <strong>Empate a decidir.</strong> O mata-mata espera a sua decisão.
          <Link className="admin-bracket-tie-link" to="/admin/grupos">Decidir o empate em Grupos</Link>
        </p>
      )}

      <section className="admin-bracket-view" aria-label="Chaveamento">
        <KnockoutBracket view={summary.view} championConfirmed={data.status?.editionFinished === true} provisionalLabel={groupsComplete && !summary.tiePending ? "classificação final" : undefined} />
      </section>

      {generated && data.matches.length > 0 && (
        <MatchGroupsList
          matches={data.matches}
          teams={data.teams}
          players={data.players}
          liveMatchId={entry.openKey}
          renderActions={(match) => data.status?.syncPending ? null : (
            <div>
              {entry.openKey === match.id ? (
                <ScoreForm
                  teamAName={teamLabel(data.teams, match.teamAId)}
                  teamBName={teamLabel(data.teams, match.teamBId)}
                  isSubmitting={entry.isSubmitting}
                  currentResult={match.result}
                  onCancel={entry.close}
                  onSubmit={(result) => entry.submit({ matchId: match.id, stage: "mata-mata", hasResult: match.status === "realizado" }, result)}
                />
              ) : (
                <Button variant="ghost" size="sm" onClick={() => entry.open(match.id)}>
                  {match.status === "realizado" ? "Corrigir resultado" : "Registrar resultado"}
                </Button>
              )}
            </div>
          )}
        />
      )}

      {entry.dialog}
    </div>
  );
}
