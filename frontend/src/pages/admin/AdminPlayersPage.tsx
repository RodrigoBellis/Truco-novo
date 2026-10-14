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
import { getPlayersAccess, resetPlayerAccess, restartAllAccess, type PlayerAccess } from "../../services/adminService";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../services/api";
import { teamLabel } from "../../utils/teamHelpers";
import "../../components/ui/Table.css";
import "./AdminPlayersPage.css";

interface Data {
  players: Player[];
  teams: Team[];
  access: PlayerAccess[];
}

export function AdminPlayersPage() {
  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [players, teams, access] = await Promise.all([getPlayers(), getTeams(), getPlayersAccess()]);
    return { players, teams, access };
  });
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [resetTarget, setResetTarget] = useState<Player | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

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

  async function handleReset() {
    if (!resetTarget) return;
    setIsResetting(true);
    try {
      await resetPlayerAccess(resetTarget.id);
      showToast("success", `Acesso de ${resetTarget.name} redefinido. Na próxima entrada ele cria uma senha nova.`);
      setResetTarget(null);
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível redefinir o acesso.");
    } finally { setIsResetting(false); }
  }

  async function handleRestartAll() {
    setIsResetting(true);
    try {
      const result = await restartAllAccess();
      showToast("success", `Acesso reiniciado para ${result.restarted} jogadores. Cada um cria a própria senha ao entrar.`);
      setConfirmAll(false);
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível reiniciar os acessos.");
    } finally { setIsResetting(false); }
  }

  if (isLoading) return <Loading fullHeight label="Carregando jogadores..." />;
  if (error || !data) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar os jogadores" description={error ?? ""} />;

  return (
    <div className="page-enter">
      <PageHeader title="Jogadores" subtitle={`${data.players.length} jogadores cadastrados`} />

      {(() => {
        const participants = data.players.filter((player) => player.teamId);
        const statusOf = (playerId: string) => data.access.find((item) => item.playerId === playerId);
        const created = participants.filter((player) => statusOf(player.id) && !statusOf(player.id)!.setupPending).length;
        return (
          <section className="access-summary" aria-label="Senhas da 5ª edição">
            <div>
              <strong className="access-summary-count">{created} de {participants.length}</strong>
              <span>jogadores já criaram a senha da 5ª edição</span>
            </div>
            <progress max={participants.length || 1} value={created} aria-label="Jogadores com senha criada" />
            <Button size="sm" variant="ghost" onClick={() => setConfirmAll(true)}>Reiniciar acesso de todos</Button>
          </section>
        );
      })()}

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
              <th>Acesso</th>
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
                <td>
                  {player.teamId ? (() => {
                    const access = data.access.find((item) => item.playerId === player.id);
                    const pending = !access || access.setupPending;
                    return (
                      <span className="player-access">
                        <Badge tone={pending ? "gold" : "green"}>{pending ? "Aguardando criação de senha" : "Senha criada"}</Badge>
                        <Button size="sm" variant="ghost" onClick={() => setResetTarget(player)}>Redefinir acesso</Button>
                      </span>
                    );
                  })() : <span className="text-faint">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        isOpen={resetTarget !== null}
        title={`Redefinir o acesso de ${resetTarget?.name ?? ""}?`}
        description="A senha atual deixa de valer e as sessões abertas são encerradas. Na próxima entrada, o jogador escolhe a carta e cria uma senha nova. Use só se ele esqueceu a senha ou se outra pessoa criou a senha no lugar dele."
        confirmLabel="Redefinir acesso"
        tone="danger"
        isConfirming={isResetting}
        onConfirm={() => void handleReset()}
        onCancel={() => setResetTarget(null)}
      />

      <ConfirmDialog
        isOpen={confirmAll}
        title="Reiniciar o acesso de todos os participantes?"
        description="Todas as senhas atuais dos participantes da 5ª edição deixam de valer e as sessões abertas caem. Cada jogador cria a própria senha na próxima entrada. Só funciona com o cadeado de resultados fechado. Duplas, jogos e histórico não mudam."
        confirmLabel="Reiniciar todos"
        tone="danger"
        isConfirming={isResetting}
        onConfirm={() => void handleRestartAll()}
        onCancel={() => setConfirmAll(false)}
      />
    </div>
  );
}
