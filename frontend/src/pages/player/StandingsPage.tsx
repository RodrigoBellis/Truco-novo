import type { GroupId, StandingRow, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { StandingsTable } from "../../components/truco/StandingsTable";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { getTeams } from "../../services/teamsService";
import { getStandings } from "../../services/groupsService";
import "./StandingsPage.css";

interface Data {
  teams: Team[];
  myGroupId: GroupId | null;
  standings: StandingRow[];
}

export function StandingsPage() {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const teams = await getTeams();
    const myTeam = teams.find((team) => team.id === user?.teamId);
    const myGroupId = myTeam?.groupId ?? null;
    const standings = myGroupId ? await getStandings(myGroupId) : [];
    return { teams, myGroupId, standings };
  }, [user?.teamId]);

  useRealtimeMatches(refetch);

  if (isLoading) return <Loading fullHeight label="Carregando classificação..." />;
  if (error) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar a classificação" description={error} />;

  if (!data?.myGroupId) {
    return (
      <div>
        <PageHeader title="Classificação" />
        <EmptyState icon="🎲" title="Sorteio ainda não realizado" description="A classificação será exibida assim que os grupos forem definidos." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Classificação" subtitle="1º colocado avança direto à semifinal · 2º ao 5º disputam o mata-mata · 6º é eliminado" />

      <div className="standings-page-groups">
        <section>
          <h2 className="section-title section-title-gold">Grupo {data.myGroupId}</h2>
          <StandingsTable rows={data.standings} teams={data.teams} highlightTeamId={user?.teamId} />
        </section>
      </div>
    </div>
  );
}
