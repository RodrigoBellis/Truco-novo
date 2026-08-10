import { useState } from "react";
import type { Match, MatchResult, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { MatchGroupsList } from "../../components/truco/MatchGroupsList";
import { ScoreForm } from "../../components/truco/ScoreForm";
import { useFetchData } from "../../hooks/useFetchData";
import { useToast } from "../../hooks/useToast";
import { getTeams } from "../../services/teamsService";
import { getMatches, recordMatchResult } from "../../services/matchesService";
import { teamLabel } from "../../utils/teamHelpers";
import { ApiError } from "../../services/api";

interface Data {
  teams: Team[];
  matches: Match[];
}

export function AdminMatchesPage() {
  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, matches] = await Promise.all([getTeams(), getMatches({ stage: "grupos" })]);
    return { teams, matches };
  });
  const { showToast } = useToast();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  if (isLoading) return <Loading fullHeight label="Carregando jogos..." />;
  if (error || !data) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar os jogos" description={error ?? ""} />;

  if (data.matches.length === 0) {
    return (
      <div>
        <PageHeader title="Jogos" subtitle="Fase de grupos" />
        <EmptyState icon="🎲" title="Sorteio ainda não realizado" description="Os confrontos da fase de grupos aparecerão aqui após o sorteio." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Jogos" subtitle="Fase de grupos — registre os resultados de cada confronto" />

      <MatchGroupsList
        matches={data.matches}
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
                {match.status === "realizado" ? "Editar resultado" : "Registrar resultado"}
              </Button>
            )}
          </div>
        )}
      />
    </div>
  );
}
