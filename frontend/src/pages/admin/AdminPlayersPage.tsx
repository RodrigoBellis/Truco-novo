import { useState } from "react";
import type { Player, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Badge } from "../../components/ui/Badge";
import { PlayerAvatar } from "../../components/ui/PlayerAvatar";
import { useFetchData } from "../../hooks/useFetchData";
import { getPlayers } from "../../services/playersService";
import { createPlayer } from "../../services/playersService";
import { getTeams } from "../../services/teamsService";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../services/api";
import { teamLabel } from "../../utils/teamHelpers";
import "../../components/ui/Table.css";

interface Data {
  players: Player[];
  teams: Team[];
}

export function AdminPlayersPage() {
  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [players, teams] = await Promise.all([getPlayers(), getTeams()]);
    return { players, teams };
  });
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await createPlayer(name.trim());
      setName("");
      showToast("success", "Jogador cadastrado. O acesso individual ainda precisa ser criado.");
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível cadastrar o jogador.");
    } finally { setIsSaving(false); }
  }

  if (isLoading) return <Loading fullHeight label="Carregando jogadores..." />;
  if (error || !data) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar os jogadores" description={error ?? ""} />;

  return (
    <div className="page-enter">
      <PageHeader title="Jogadores" subtitle={`${data.players.length} jogadores cadastrados`} />

      <form className="admin-player-create" onSubmit={(event) => { event.preventDefault(); void handleCreate(); }}>
        <label htmlFor="new-player-name">Cadastrar pessoa</label>
        <input id="new-player-name" name="name" autoComplete="off" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
        <Button type="submit" isLoading={isSaving} disabled={!name.trim()}>Adicionar jogador</Button>
      </form>

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
                <td><span className="player-directory-identity"><PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} size="sm" />{player.name}</span></td>
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
