import { useState } from "react";
import type { MatchResult, Player } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { KnockoutBracket } from "../../components/truco/KnockoutBracket";
import { MatchGroupsList } from "../../components/truco/MatchGroupsList";
import { ScoreForm } from "../../components/truco/ScoreForm";
import { useFetchData } from "../../hooks/useFetchData";
import { useToast } from "../../hooks/useToast";
import { recordMatchResult } from "../../services/matchesService";
import { generateBracket } from "../../services/bracketService";
import { getPlayers } from "../../services/playersService";
import { loadKnockoutData, quarterfinalRematchNote, summarizeKnockout, type KnockoutData } from "../../utils/knockout";
import { teamLabel } from "../../utils/teamHelpers";
import { ApiError } from "../../services/api";
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
  const { showToast } = useToast();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleSubmit(matchId: string, result: MatchResult) {
    setIsSubmitting(true);
    try {
      await recordMatchResult(matchId, result);
      showToast("success", "Resultado registrado com sucesso.");
      setExpandedId(null);
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível registrar o resultado.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      await generateBracket();
      showToast("success", "Mata-mata gerado a partir da classificação final.");
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível gerar o mata-mata.");
    } finally {
      setIsGenerating(false);
    }
  }

  if (isLoading) return <Loading fullHeight label="Carregando mata-mata..." />;
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
  const pendingMatches = data.matches.filter((match) => match.status === "pendente");
  const rematchNote = quarterfinalRematchNote(summary.view);

  const note = generated
    ? summary.phase === "encerrado"
      ? "Todos os confrontos do mata-mata já foram disputados."
      : rematchNote ?? "Lance os resultados abaixo: cada fase encerrada abre a seguinte. As quartas são montadas quando as duas repescagens terminarem."
    : summary.tiePending
      ? "Há empate que sobreviveu a todos os critérios (pontos, vitórias, vitórias por 2x0, confronto direto e saldo de quedas). Decida as posições na tela Grupos antes de gerar o mata-mata."
      : groupsComplete
        ? "Fase de grupos encerrada. Confira a classificação e gere o mata-mata para criar os jogos da repescagem. Depois disso os placares da fase de grupos não podem mais ser corrigidos."
        : "Chaveamento provisório, pela classificação de hoje. O mata-mata é gerado quando os dois grupos terminarem.";

  return (
    <div className="page-enter">
      <PageHeader
        title="Mata-mata"
        subtitle={SUBTITLE}
        actions={!generated && groupsComplete && !summary.tiePending ? <Button onClick={handleGenerate} isLoading={isGenerating}>Gerar mata-mata</Button> : undefined}
      />

      <p className="admin-bracket-note" role="status">{note}</p>

      <section className="admin-bracket-view" aria-label="Chaveamento">
        <KnockoutBracket view={summary.view} provisionalLabel={groupsComplete && !summary.tiePending ? "aguardando confirmação" : undefined} />
      </section>

      {generated && pendingMatches.length > 0 && (
        <MatchGroupsList
          matches={pendingMatches}
          teams={data.teams}
          players={data.players}
          liveMatchId={expandedId}
          renderActions={(match) => (
            <div>
              {expandedId === match.id ? (
                <ScoreForm
                  teamAName={teamLabel(data.teams, match.teamAId)}
                  teamBName={teamLabel(data.teams, match.teamBId)}
                  isSubmitting={isSubmitting}
                  onSubmit={(result) => handleSubmit(match.id, result)}
                />
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setExpandedId(match.id)}>
                  Registrar resultado
                </Button>
              )}
            </div>
          )}
        />
      )}
    </div>
  );
}
