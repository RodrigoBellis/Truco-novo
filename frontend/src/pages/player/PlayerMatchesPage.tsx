import { useState } from "react";
import type { Match, MatchResult, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { MatchGroupsList } from "../../components/truco/MatchGroupsList";
import { ScoreForm } from "../../components/truco/ScoreForm";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { useToast } from "../../hooks/useToast";
import { getTeams } from "../../services/teamsService";
import { getMatches, recordMatchResult } from "../../services/matchesService";
import { teamLabel } from "../../utils/teamHelpers";
import { ApiError } from "../../services/api";

interface Data {
  teams: Team[];
  matches: Match[];
}

export function PlayerMatchesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, matches] = await Promise.all([getTeams(), getMatches()]);
    return { teams, matches: matches.filter((m) => m.status === "pendente") };
  });

  useRealtimeMatches(refetch);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(matchId: string, result: MatchResult) {
    setIsSubmitting(true);
    try {
      await recordMatchResult(matchId, result);
      showToast("success", "Resultado registrado! A classificação do seu grupo já foi atualizada.");
      setExpandedId(null);
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível registrar o resultado.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <Loading fullHeight label="Carregando jogos..." />;
  if (error) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar os jogos" description={error} />;

  return (
    <div>
      <PageHeader title="Jogos" subtitle="Seus próximos confrontos — registre o placar assim que a partida terminar" />
      {data && data.matches.length > 0 ? (
        <MatchGroupsList
          matches={data.matches}
          teams={data.teams}
          highlightTeamId={user?.teamId}
          liveMatchId={expandedId}
          renderActions={(match) => {
            // Todo jogo aqui já é da própria dupla (o backend só devolve os seus pendentes),
            // mas a checagem fica explícita por segurança caso isso mude no futuro.
            const isMine = match.teamAId === user?.teamId || match.teamBId === user?.teamId;
            if (!isMine) return null;

            return (
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
            );
          }}
        />
      ) : (
        <EmptyState icon="🎴" title="Nenhum jogo pendente" description="Sua dupla não tem confrontos pendentes ou o sorteio ainda não ocorreu." />
      )}
    </div>
  );
}
