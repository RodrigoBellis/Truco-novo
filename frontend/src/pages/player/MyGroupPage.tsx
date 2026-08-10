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

interface GroupData {
  teams: Team[];
  groupId: GroupId | null;
  standings: StandingRow[];
}

export function MyGroupPage() {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useFetchData<GroupData>(async () => {
    const teams = await getTeams();
    const myTeam = teams.find((t) => t.id === user?.teamId);
    const groupId = myTeam?.groupId ?? null;
    const standings = groupId ? await getStandings(groupId) : [];
    return { teams, groupId, standings };
  }, [user?.teamId]);

  useRealtimeMatches(refetch);

  if (isLoading) return <Loading fullHeight label="Carregando seu grupo..." />;
  if (error) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar seu grupo" description={error} />;

  if (!data?.groupId) {
    return (
      <div>
        <PageHeader title="Meu Grupo" />
        <EmptyState icon="🎲" title="Sorteio ainda não realizado" description="Assim que o administrador realizar o sorteio, seu grupo aparecerá aqui." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Meu Grupo" subtitle={`Grupo ${data.groupId} · Truco do Novo`} />
      <StandingsTable rows={data.standings} teams={data.teams} highlightTeamId={user?.teamId} />
    </div>
  );
}
