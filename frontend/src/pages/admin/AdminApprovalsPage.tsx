import { useState } from "react";
import type { Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { initials } from "../../utils/format";
import { useFetchData } from "../../hooks/useFetchData";
import { useToast } from "../../hooks/useToast";
import { getTeams, approveTeam, rejectTeam } from "../../services/teamsService";
import { ApiError } from "../../services/api";
import "./AdminApprovalsPage.css";

export function AdminApprovalsPage() {
  const { data: teams, isLoading, error, refetch } = useFetchData<Team[]>(getTeams);
  const { showToast } = useToast();

  const [pendingAction, setPendingAction] = useState<{ team: Team; type: "approve" | "reject" } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleConfirm() {
    if (!pendingAction) return;
    setIsConfirming(true);
    try {
      if (pendingAction.type === "approve") {
        await approveTeam(pendingAction.team.id);
        showToast("success", `Dupla ${pendingAction.team.name} aprovada.`);
      } else {
        await rejectTeam(pendingAction.team.id);
        showToast("success", `Inscrição de ${pendingAction.team.name} recusada.`);
      }
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível concluir a ação.");
    } finally {
      setIsConfirming(false);
      setPendingAction(null);
    }
  }

  if (isLoading) return <Loading fullHeight label="Carregando inscrições..." />;
  if (error || !teams) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar as inscrições" description={error ?? ""} />;

  const pending = teams.filter((t) => t.status === "pendente");

  return (
    <div className="page-enter">
      <PageHeader title="Aprovações" subtitle="Inscrições de duplas aguardando análise" />

      {pending.length === 0 ? (
        <EmptyState icon="✅" title="Nenhuma inscrição pendente" description="Todas as duplas cadastradas já foram avaliadas." />
      ) : (
        <div className="admin-approvals-list">
          {pending.map((team) => (
            <Card key={team.id} className="admin-approvals-item">
              <div className="admin-approvals-avatar">{initials(team.name)}</div>
              <strong className="admin-approvals-name">{team.name}</strong>
              <div className="admin-approvals-actions">
                <Button variant="danger" size="sm" onClick={() => setPendingAction({ team, type: "reject" })}>
                  Recusar
                </Button>
                <Button variant="primary" size="sm" onClick={() => setPendingAction({ team, type: "approve" })}>
                  Aprovar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingAction)}
        title={pendingAction?.type === "approve" ? "Aprovar inscrição" : "Recusar inscrição"}
        description={`Confirma ${pendingAction?.type === "approve" ? "a aprovação" : "a recusa"} da dupla ${pendingAction?.team.name}?`}
        tone={pendingAction?.type === "reject" ? "danger" : "default"}
        confirmLabel={pendingAction?.type === "approve" ? "Aprovar" : "Recusar"}
        isConfirming={isConfirming}
        onConfirm={handleConfirm}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
