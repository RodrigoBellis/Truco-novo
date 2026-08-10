import type { Player, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Badge } from "../../components/ui/Badge";
import { useFetchData } from "../../hooks/useFetchData";
import { getPlayers } from "../../services/playersService";
import { getTeams } from "../../services/teamsService";
import { teamLabel } from "../../utils/teamHelpers";
import "../../components/ui/Table.css";

interface Data {
  players: Player[];
  teams: Team[];
}

export function AdminPlayersPage() {
  const { data, isLoading, error } = useFetchData<Data>(async () => {
    const [players, teams] = await Promise.all([getPlayers(), getTeams()]);
    return { players, teams };
  });

  if (isLoading) return <Loading fullHeight label="Carregando jogadores..." />;
  if (error || !data) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar os jogadores" description={error ?? ""} />;

  return (
    <div>
      <PageHeader title="Jogadores" subtitle={`${data.players.length} jogadores cadastrados`} />

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Dupla</th>
            </tr>
          </thead>
          <tbody>
            {data.players.map((player) => (
              <tr key={player.id}>
                <td>{player.name}</td>
                <td>
                  {player.teamId ? (
                    <Badge tone="neutral">{teamLabel(data.teams, player.teamId)}</Badge>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
