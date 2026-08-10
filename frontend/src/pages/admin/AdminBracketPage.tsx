import { useState } from "react";
import type { BracketMatch, Match, MatchResult, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { BracketView } from "../../components/truco/BracketView";
import { MatchGroupsList } from "../../components/truco/MatchGroupsList";
import { ScoreForm } from "../../components/truco/ScoreForm";
import { useFetchData } from "../../hooks/useFetchData";
import { useToast } from "../../hooks/useToast";
import { getTeams } from "../../services/teamsService";
import { getMatches, recordMatchResult } from "../../services/matchesService";
import { getBracket, generateBracket } from "../../services/bracketService";
import { teamLabel } from "../../utils/teamHelpers";
import { ApiError } from "../../services/api";

interface Data {
  teams: Team[];
  matches: Match[];
  bracketMatches: BracketMatch[];
}

export function AdminBracketPage() {
  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, matches, bracketMatches] = await Promise.all([getTeams(), getMatches({ stage: "mata-mata" }), getBracket()]);
    return { teams, matches, bracketMatches };
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
      showToast("success", "Chave do mata-mata gerada com sucesso.");
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "A fase de grupos ainda não foi concluída.");
    } finally {
      setIsGenerating(false);
    }
  }

  if (isLoading) return <Loading fullHeight label="Carregando mata-mata..." />;
  if (error || !data) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar o mata-mata" description={error ?? ""} />;

  if (data.bracketMatches.length === 0) {
    return (
      <div>
        <PageHeader title="Mata-mata" subtitle="Chave eliminatória do campeonato" />
        <EmptyState
          icon="🏆"
          title="Chave ainda não gerada"
          description="A chave é montada automaticamente assim que a fase de grupos é concluída. Você também pode gerá-la manualmente."
          action={
            <Button isLoading={isGenerating} onClick={handleGenerate}>
              Gerar mata-mata
            </Button>
          }
        />
      </div>
    );
  }

  const pendingMatches = data.matches.filter((m) => m.status === "pendente");

  return (
    <div>
      <PageHeader title="Mata-mata" subtitle="Chave eliminatória do campeonato" />

      <Card className="bracket-card">
        <BracketView bracketMatches={data.bracketMatches} matches={data.matches} teams={data.teams} />
      </Card>

      {pendingMatches.length > 0 ? (
        <MatchGroupsList
          matches={pendingMatches}
          teams={data.teams}
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
      ) : (
        <EmptyState icon="🏆" title="Campeonato finalizado" description="Todos os confrontos do mata-mata já foram disputados." />
      )}
    </div>
  );
}
