import { useState } from "react";
import type { Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { AnimatedBorderCard } from "../../components/ui/AnimatedBorderCard";
import { TeamCard } from "../../components/truco/TeamCard";
import { useFetchData } from "../../hooks/useFetchData";
import { useToast } from "../../hooks/useToast";
import { getTeams } from "../../services/teamsService";
import { runDraw } from "../../services/adminService";
import { ApiError } from "../../services/api";
import "./AdminDrawPage.css";

export function AdminDrawPage() {
  const { data: teams, isLoading, error, refetch } = useFetchData<Team[]>(getTeams);
  const { showToast } = useToast();

  const [showConfirm, setShowConfirm] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  async function handleDraw() {
    setIsDrawing(true);
    try {
      await runDraw();
      showToast("success", "Sorteio realizado com sucesso!");
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível realizar o sorteio.");
    } finally {
      setIsDrawing(false);
      setShowConfirm(false);
    }
  }

  if (isLoading) return <Loading fullHeight label="Carregando duplas..." />;
  if (error || !teams) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar as duplas" description={error ?? ""} />;

  const approved = teams.filter((t) => t.status === "aprovada");
  const drawDone = approved.some((t) => t.groupId);
  const groupA = approved.filter((t) => t.groupId === "A");
  const groupB = approved.filter((t) => t.groupId === "B");

  return (
    <div className="page-enter">
      <PageHeader
        title="Sorteio"
        subtitle="Distribua automaticamente as duplas aprovadas entre os Grupos A e B"
        actions={
          drawDone ? (
            <Button onClick={() => setShowConfirm(true)} isLoading={isDrawing}>
              Refazer sorteio
            </Button>
          ) : (
            <AnimatedBorderCard inline radius="var(--radius-md)" duration={3}>
              <Button onClick={() => setShowConfirm(true)} isLoading={isDrawing}>
                Iniciar Campeonato
              </Button>
            </AnimatedBorderCard>
          )
        }
      />

      <Card className="admin-draw-info">
        <p className="text-muted">
          <strong>{approved.length}</strong> duplas aprovadas aguardando distribuição. As duplas cabeças de chave (★) nunca ficam no
          mesmo grupo.
        </p>
      </Card>

      {!drawDone ? (
        <div className="admin-draw-pending-grid">
          {approved.map((team) => (
            <TeamCard key={team.id} team={team} highlight={team.seeded} />
          ))}
        </div>
      ) : (
        <div className="admin-draw-groups">
          <section>
            <h2 className="admin-draw-group-title">Grupo A</h2>
            <div className="admin-draw-pending-grid">
              {groupA.map((team) => (
                <TeamCard key={team.id} team={team} highlight={team.seeded} />
              ))}
            </div>
          </section>
          <section>
            <h2 className="admin-draw-group-title">Grupo B</h2>
            <div className="admin-draw-pending-grid">
              {groupB.map((team) => (
                <TeamCard key={team.id} team={team} highlight={team.seeded} />
              ))}
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        isOpen={showConfirm}
        title={drawDone ? "Refazer sorteio?" : "Iniciar o campeonato?"}
        description={
          drawDone
            ? "Isso irá reorganizar os grupos e apagar os jogos já cadastrados na fase de grupos. Esta ação não pode ser desfeita."
            : "As duplas aprovadas serão distribuídas automaticamente entre os Grupos A e B."
        }
        tone={drawDone ? "danger" : "default"}
        confirmLabel="Confirmar"
        isConfirming={isDrawing}
        onConfirm={handleDraw}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
