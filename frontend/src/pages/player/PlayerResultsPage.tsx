import type { Match, Player, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { MatchGroupsList } from "../../components/truco/MatchGroupsList";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { getTeams } from "../../services/teamsService";
import { getMatches } from "../../services/matchesService";
import { getPlayers } from "../../services/playersService";

interface Data {
  teams: Team[];
  matches: Match[];
  players: Player[];
}

export function PlayerResultsPage() {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, matches, players] = await Promise.all([getTeams(), getMatches(), getPlayers()]);
    return { teams, players, matches: matches.filter((m) => m.status === "realizado") };
  });

  useRealtimeMatches(refetch);

  if (isLoading) return <Loading fullHeight label="Carregando resultados..." />;
  if (error) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar os resultados" description={error} />;

  return (
    <div className="page-enter">
      <PageHeader title="Resultados" subtitle="Jogos já disputados no seu grupo — eles afetam a sua classificação" />
      {data && data.matches.length > 0 ? (
        <MatchGroupsList matches={data.matches} teams={data.teams} players={data.players} highlightTeamId={user?.teamId} />
      ) : (
        <EmptyState icon="📋" title="Nenhum resultado ainda" description="Os resultados do seu grupo aparecerão aqui assim que os jogos forem disputados." />
      )}
    </div>
  );
}
