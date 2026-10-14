import type { Player, StandingRow, Team } from "@truco/shared";
import { MATCHES_PER_GROUP, SINGLE_GROUP_NAME, TEAMS_PER_GROUP } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { StandingsTable } from "../../components/truco/StandingsTable";
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { getTeams } from "../../services/teamsService";
import { getPlayers } from "../../services/playersService";
import { getStandings } from "../../services/groupsService";
import "./GroupsPage.css";

interface Data {
  teams: Team[];
  players: Player[];
  standings: StandingRow[];
}

const SUBTITLE = `${SINGLE_GROUP_NAME} · ${TEAMS_PER_GROUP} duplas, todos contra todos (${MATCHES_PER_GROUP} jogos) · 5ª Edição 2026`;

/** Classificação da fase de grupos: desde 14/10/2026 a 5ª edição tem um grupo único. */
export function GroupsPage() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, players, standings] = await Promise.all([getTeams(), getPlayers(), getStandings("A")]);
    return { teams, players, standings };
  }, [user?.teamId]);
  useRealtimeMatches(refetch);

  if (isLoading) return <Loading fullHeight label="Carregando a classificação..." />;
  if (error) return <EmptyState icon={<Icon name="group" size={36} />} tone="danger" title="Não foi possível carregar a classificação" description={error} />;

  if (!data?.standings.length) {
    return <div className="page-enter"><PageHeader title="Grupos" subtitle={SUBTITLE} /><EmptyState icon={<Icon name="group" size={36} />} title="Grupo ainda não definido" description="A classificação aparece aqui assim que as duplas forem organizadas pelo administrador." /></div>;
  }

  const inGroup = data.standings.some((row) => row.teamId === user?.teamId);
  const missing = TEAMS_PER_GROUP - data.standings.length;
  return (
    <div className="page-enter">
      <PageHeader title="Grupos" subtitle={SUBTITLE} />
      <section className="groups-standings groups-standings-enter" aria-labelledby="groups-standings-title">
        <div className="groups-standings-heading"><div><h2 id="groups-standings-title">{SINGLE_GROUP_NAME}</h2><p>{data.standings.length} duplas na disputa{missing > 0 ? ` · ${missing === 1 ? "1 vaga aguardando dupla" : `${missing} vagas aguardando duplas`}` : ""} · 1º e 2º na semifinal · 3º a 6º nas quartas · 7º eliminado</p></div>{inGroup && <span className="groups-own-badge">Sua dupla está aqui</span>}</div>
        <StandingsTable rows={data.standings} teams={data.teams} players={data.players} highlightTeamId={user?.teamId} />
      </section>
    </div>
  );
}
