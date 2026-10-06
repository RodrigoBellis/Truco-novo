import type { Player, StandingRow, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { Icon } from "../../components/ui/Icon";
import { getTeams } from "../../services/teamsService";
import { getPlayers } from "../../services/playersService";
import { getStandings } from "../../services/groupsService";
import { PlayerAvatar } from "../../components/ui/PlayerAvatar";
import { TeamIdentityCard } from "../../components/truco/TeamIdentityCard";
import { TeamCampaignStats } from "../../components/truco/TeamCampaignStats";
import { TeamCrest } from "../../components/truco/TeamCrest";
import { teamHue, teamTintStyle } from "../../utils/teamColor";
import "./MyTeamPage.css";

interface TeamData {
  team: Team | undefined;
  teams: Team[];
  players: Player[];
  standing: StandingRow | undefined;
}

export function MyTeamPage() {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useFetchData<TeamData>(async () => {
    const [teams, players] = await Promise.all([getTeams(), getPlayers()]);
    const team = teams.find((t) => t.id === user?.teamId);
    const standings = team?.groupId ? await getStandings(team.groupId) : [];
    const standing = standings.find((row) => row.teamId === team?.id);
    return { team, teams, players, standing };
  }, [user?.teamId]);
  useRealtimeMatches(refetch);

  if (isLoading) return <Loading fullHeight label="Carregando sua dupla..." />;
  if (error) return <EmptyState icon={<Icon name="team" size={36} />} tone="danger" title="Não foi possível carregar sua dupla" description={error} />;

  const team = data?.team;
  if (!team) {
    return (
      <div className="page-enter">
        <PageHeader title="Minha Dupla" />
        <EmptyState icon={<Icon name="team" size={36} />} title="Você ainda não está em uma dupla" description="Fale com o administrador do campeonato para confirmar sua inscrição." />
      </div>
    );
  }

  const hue = teamHue(team.id, data?.teams);
  const teammates = data?.players.filter((p) => p.id === team.player1Id || p.id === team.player2Id) ?? [];

  return (
    <div className="page-enter">
      <PageHeader title="Minha Dupla" subtitle={team.name} />

      <TeamIdentityCard team={team} players={data?.players ?? []} teams={data?.teams} standing={data?.standing} playerId={user?.playerId} showMembers={false} />

      <div className="my-team-players team-tint" style={teamTintStyle(hue)}>
        {teammates.map((player) => (
          <Card key={player.id} className="my-team-player-card">
            <PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} size="lg" />
            <div className="my-team-player-text">
              <strong>{player.name}</strong>
              <p>{player.id === user?.playerId ? "Você" : "Parceiro de dupla"}</p>
              <span className="my-team-player-team"><TeamCrest name={team.name} hue={hue} size="dot" />{team.name}{team.groupId ? ` · Grupo ${team.groupId}` : ""}</span>
            </div>
          </Card>
        ))}
      </div>

      <TeamCampaignStats standing={data?.standing} />
    </div>
  );
}
