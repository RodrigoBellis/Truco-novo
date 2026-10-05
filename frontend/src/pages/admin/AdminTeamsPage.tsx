import { useMemo, useState } from "react";
import type { GroupId, Player, Team } from "@truco/shared";
import { isValidTeamStrength } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { TeamCard } from "../../components/truco/TeamCard";
import { Button } from "../../components/ui/Button";
import { useFetchData } from "../../hooks/useFetchData";
import { useToast } from "../../hooks/useToast";
import { getTeams, saveTeamParticipation, setTeamParticipationStatus } from "../../services/teamsService";
import { getPlayers } from "../../services/playersService";
import { ApiError } from "../../services/api";
import "./AdminTeamsPage.css";

interface Data { teams: Team[]; players: Player[] }

export function AdminTeamsPage() {
  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, players] = await Promise.all([getTeams(), getPlayers()]);
    return { teams, players };
  });
  const { showToast } = useToast();
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [name, setName] = useState("");
  const [player1Id, setPlayer1Id] = useState("");
  const [player2Id, setPlayer2Id] = useState("");
  const [groupId, setGroupId] = useState<GroupId>("A");
  const [strength, setStrength] = useState(3);
  const [isSaving, setIsSaving] = useState(false);

  const availablePlayers = useMemo(() => {
    if (!data) return [];
    const used = new Set(data.teams.filter((team) => team.id !== editingTeam?.id).flatMap((team) => [team.player1Id, team.player2Id]));
    return data.players.filter((player) => !used.has(player.id));
  }, [data, editingTeam]);

  function clearForm() {
    setEditingTeam(null); setName(""); setPlayer1Id(""); setPlayer2Id(""); setGroupId("A"); setStrength(3);
  }

  function editTeam(team: Team) {
    setEditingTeam(team); setName(team.name); setPlayer1Id(team.player1Id); setPlayer2Id(team.player2Id);
    setGroupId(team.groupId ?? "A"); setStrength(team.strength);
    document.getElementById("team-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function save() {
    if (!data || !name.trim() || !player1Id || !player2Id || player1Id === player2Id || !isValidTeamStrength(strength)) {
      showToast("error", "Preencha o nome, escolha dois jogadores diferentes e uma força de 1 a 5.");
      return;
    }
    setIsSaving(true);
    try {
      await saveTeamParticipation({ name: name.trim(), player1Id, player2Id, groupId, strength }, editingTeam?.id);
      showToast("success", editingTeam ? "Participação atualizada." : "Dupla criada para esta edição.");
      clearForm(); refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível salvar a dupla.");
    } finally { setIsSaving(false); }
  }

  async function toggleParticipation(team: Team) {
    try {
      await setTeamParticipationStatus(team.id, team.status === "aprovada" ? "pendente" : "aprovada");
      showToast("success", team.status === "aprovada" ? "Dupla retirada da edição; os dados foram preservados." : "Dupla incluída na edição.");
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível atualizar a participação.");
    }
  }

  if (isLoading) return <Loading fullHeight label="Carregando duplas…" />;
  if (error || !data) return <EmptyState icon="⚠" tone="danger" title="Não foi possível carregar as duplas" description={error ?? ""} />;

  const previewPlayers = [data.players.find((player) => player.id === player1Id), data.players.find((player) => player.id === player2Id)];
  const preview: Team = {
    id: editingTeam?.id ?? "preview-team", name: name.trim() || "Nome da dupla", player1Id: player1Id || "preview-1",
    player2Id: player2Id || "preview-2", status: "aprovada", seeded: false, isPlaceholder: false, groupId, strength,
  };

  return (
    <div className="page-enter">
      <PageHeader title="Duplas da 5ª edição" subtitle={`${data.teams.filter((team) => team.status === "aprovada").length} de 10 duplas · ${data.teams.filter((team) => team.status === "aprovada" && team.groupId === "A").length}/5 no Grupo A · ${data.teams.filter((team) => team.status === "aprovada" && team.groupId === "B").length}/5 no Grupo B`} />

      <section id="team-editor" className="admin-teams-editor" aria-labelledby="team-editor-title">
        <div>
          <h2 id="team-editor-title">{editingTeam ? "Editar participação" : "Montar uma dupla"}</h2>
          <p>Escolha dois jogadores livres nesta edição e defina grupo e força da dupla.</p>
        </div>
        <div className="admin-teams-editor-grid">
          <label><span>Nome da dupla</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label>
          <label><span>Jogador 1</span><select value={player1Id} onChange={(event) => setPlayer1Id(event.target.value)}>
            <option value="">Selecione um jogador</option>{availablePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select></label>
          <label><span>Jogador 2</span><select value={player2Id} onChange={(event) => setPlayer2Id(event.target.value)}>
            <option value="">Selecione um jogador</option>{availablePlayers.map((player) => <option key={player.id} value={player.id} disabled={player.id === player1Id}>{player.name}</option>)}
          </select></label>
          <label><span>Grupo</span><select value={groupId} onChange={(event) => setGroupId(event.target.value as GroupId)}>
            <option value="A">Grupo A</option><option value="B">Grupo B</option>
          </select></label>
          <label><span>Força da dupla</span><select value={strength} onChange={(event) => setStrength(Number(event.target.value))}>
            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{"★".repeat(value)} ({value}/5)</option>)}
          </select></label>
        </div>
        <div className="admin-teams-preview">
          <span>Prévia</span>
          <TeamCard team={preview} />
          <p>{previewPlayers[0]?.name ?? "Jogador 1"} + {previewPlayers[1]?.name ?? "Jogador 2"}</p>
        </div>
        <div className="admin-teams-modal-actions">
          {editingTeam && <Button variant="ghost" onClick={clearForm} disabled={isSaving}>Cancelar edição</Button>}
          <Button onClick={() => void save()} isLoading={isSaving} disabled={data.teams.filter((team) => team.status === "aprovada").length >= 10 && !editingTeam}>Salvar dupla</Button>
        </div>
      </section>

      {data.teams.length === 0 ? <EmptyState icon="♠" title="Nenhuma dupla nesta edição" description="Monte as duplas manualmente usando os jogadores cadastrados." /> : (
        <div className="admin-teams-grid">
          {data.teams.map((team) => <div key={team.id} className="admin-teams-item"><TeamCard team={team} /><div className="admin-teams-item-actions"><Button variant="ghost" size="sm" onClick={() => editTeam(team)}>Editar participação</Button><Button variant={team.status === "aprovada" ? "secondary" : "primary"} size="sm" onClick={() => void toggleParticipation(team)}>{team.status === "aprovada" ? "Retirar desta edição" : "Incluir na edição"}</Button></div></div>)}
        </div>
      )}
    </div>
  );
}
