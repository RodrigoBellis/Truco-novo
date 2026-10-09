import type { Match, Player, StandingRow, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { Icon } from "../../components/ui/Icon";
import { getTeams } from "../../services/teamsService";
import { getPlayers } from "../../services/playersService";
import { getStandings } from "../../services/groupsService";
import { getMatches } from "../../services/matchesService";
import { TeamProfileHero } from "../../components/truco/TeamProfileHero";
import { TeamPerformanceStrip } from "../../components/truco/TeamPerformanceStrip";
import { TeamRecentResults } from "../../components/truco/TeamRecentResults";
import "./MyTeamPage.css";

interface TeamData {
  team: Team | undefined;
  teams: Team[];
  players: Player[];
  standing: StandingRow | undefined;
  /** `null` quando a busca de partidas falhou: só o histórico fica indisponível. */
  matches: Match[] | null;
}

export function MyTeamPage() {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useFetchData<TeamData>(async () => {
    const [teams, players] = await Promise.all([getTeams(), getPlayers()]);
    const team = teams.find((t) => t.id === user?.teamId);
    // A classificação é essencial (falha derruba a tela, como antes); as partidas não.
    const [standingsResult, matchesResult] = await Promise.allSettled([
      team?.groupId ? getStandings(team.groupId) : Promise.resolve<StandingRow[]>([]),
      team ? getMatches({ teamId: team.id }) : Promise.resolve<Match[]>([]),
    ]);
    if (standingsResult.status === "rejected") throw standingsResult.reason;
    const standing = standingsResult.value.find((row) => row.teamId === team?.id);
    const matches = matchesResult.status === "fulfilled" ? matchesResult.value : null;
    return { team, teams, players, standing, matches };
  }, [user?.teamId]);
  useRealtimeMatches(refetch);

  if (isLoading) return <Loading fullHeight label="Carregando sua dupla..." />;
  if (error) return <EmptyState icon={<Icon name="team" size={36} />} tone="danger" title="Não foi possível carregar sua dupla" description={error} />;

  const team = data?.team;
  if (!data || !team) {
    return (
      <div className="page-enter">
        <PageHeader title="Minha Dupla" />
        <EmptyState icon={<Icon name="team" size={36} />} title="Você ainda não está em uma dupla" description="Fale com o administrador do campeonato para confirmar sua inscrição." />
      </div>
    );
  }

  return (
    <div className="my-team page-enter">
      <PageHeader title="Minha Dupla" subtitle="Truco do Novo · 5ª Edição" />
      <TeamProfileHero team={team} players={data.players} teams={data.teams} standing={data.standing} playerId={user?.playerId} />
      <TeamPerformanceStrip standing={data.standing} />
      <TeamRecentResults teamId={team.id} teams={data.teams} matches={data.matches} />
    </div>
  );
}
