import type { Player, StandingRow, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { getTeams } from "../../services/teamsService";
import { getPlayers } from "../../services/playersService";
import { getStandings } from "../../services/groupsService";
import { initials } from "../../utils/format";
import "./MyTeamPage.css";

interface TeamData {
  team: Team | undefined;
  players: Player[];
  standing: StandingRow | undefined;
}

export function MyTeamPage() {
  const { user } = useAuth();

  const { data, isLoading, error } = useFetchData<TeamData>(async () => {
    const [teams, players] = await Promise.all([getTeams(), getPlayers()]);
    const team = teams.find((t) => t.id === user?.teamId);
    const standings = team?.groupId ? await getStandings(team.groupId) : [];
    const standing = standings.find((row) => row.teamId === team?.id);
    return { team, players, standing };
  }, [user?.teamId]);

  if (isLoading) return <Loading fullHeight label="Carregando sua dupla..." />;
  if (error) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar sua dupla" description={error} />;

  const team = data?.team;
  if (!team) {
    return (
      <div>
        <PageHeader title="Minha Dupla" />
        <EmptyState icon="🎴" title="Você ainda não está em uma dupla" description="Fale com o administrador do campeonato para confirmar sua inscrição." />
      </div>
    );
  }

  const teammates = data?.players.filter((p) => p.id === team.player1Id || p.id === team.player2Id) ?? [];

  return (
    <div>
      <PageHeader title="Minha Dupla" subtitle={team.name} />

      <Card accent="gold" className="my-team-card">
        <div className="my-team-avatar">{initials(team.name)}</div>
        <div>
          <strong className="my-team-name">{team.name}</strong>
          <div className="my-team-badges">
            {team.groupId && <Badge tone="green">Grupo {team.groupId}</Badge>}
            {team.seeded && <Badge tone="gold">★ Cabeça de chave</Badge>}
            <Badge tone={team.status === "aprovada" ? "info" : "neutral"}>
              {team.status === "aprovada" ? "Aprovada" : "Pendente"}
            </Badge>
          </div>
        </div>
      </Card>

      <div className="my-team-players">
        {teammates.map((player) => (
          <Card key={player.id} className="my-team-player-card">
            <div className="my-team-avatar my-team-avatar-sm">{player.name.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{player.name}</strong>
              <p className="text-faint">{player.id === user?.playerId ? "Você" : "Parceiro de dupla"}</p>
            </div>
          </Card>
        ))}
      </div>

      {data?.standing && (
        <Card className="my-team-stats">
          <h3>Desempenho no grupo</h3>
          <div className="my-team-stats-grid">
            <div>
              <span className="text-faint">Posição</span>
              <strong>{data.standing.position}º</strong>
            </div>
            <div>
              <span className="text-faint">Vitórias</span>
              <strong>{data.standing.vitorias}</strong>
            </div>
            <div>
              <span className="text-faint">Derrotas</span>
              <strong>{data.standing.derrotas}</strong>
            </div>
            <div>
              <span className="text-faint">Pontos</span>
              <strong>{data.standing.pontos}</strong>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
