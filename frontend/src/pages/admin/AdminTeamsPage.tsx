import { useState } from "react";
import type { Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { TeamCard } from "../../components/truco/TeamCard";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { useFetchData } from "../../hooks/useFetchData";
import { useToast } from "../../hooks/useToast";
import { getTeams, renameTeam } from "../../services/teamsService";
import { ApiError } from "../../services/api";
import "./AdminTeamsPage.css";

export function AdminTeamsPage() {
  const { data: teams, isLoading, error, refetch } = useFetchData<Team[]>(getTeams);
  const { showToast } = useToast();

  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function openEdit(team: Team) {
    setEditingTeam(team);
    setNameDraft(team.name);
  }

  async function saveEdit() {
    if (!editingTeam || !nameDraft.trim()) return;
    setIsSaving(true);
    try {
      await renameTeam(editingTeam.id, nameDraft.trim());
      showToast("success", "Dupla atualizada com sucesso.");
      setEditingTeam(null);
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível atualizar a dupla.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <Loading fullHeight label="Carregando duplas..." />;
  if (error || !teams) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar as duplas" description={error ?? ""} />;

  return (
    <div>
      <PageHeader title="Duplas" subtitle={`${teams.length} duplas cadastradas`} />

      <div className="admin-teams-grid">
        {teams.map((team) => (
          <div key={team.id} className="admin-teams-item">
            <TeamCard team={team} />
            <Button variant="ghost" size="sm" onClick={() => openEdit(team)}>
              Editar nome
            </Button>
          </div>
        ))}
      </div>

      <Modal isOpen={Boolean(editingTeam)} title="Editar dupla" onClose={() => setEditingTeam(null)}>
        <label className="admin-teams-modal-field">
          <span>Nome da dupla</span>
          <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
        </label>
        <div className="admin-teams-modal-actions">
          <Button variant="ghost" onClick={() => setEditingTeam(null)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={saveEdit} isLoading={isSaving} disabled={!nameDraft.trim()}>
            Salvar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
