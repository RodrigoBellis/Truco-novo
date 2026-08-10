import { useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../hooks/useToast";
import { resetTournament } from "../../services/adminService";
import { ApiError } from "../../services/api";
import "./AdminSettingsPage.css";

export function AdminSettingsPage() {
  const { showToast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  async function handleReset() {
    setIsResetting(true);
    try {
      await resetTournament();
      showToast("success", "Campeonato reiniciado para os dados iniciais.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível reiniciar o campeonato.");
    } finally {
      setIsResetting(false);
      setShowConfirm(false);
    }
  }

  return (
    <div>
      <PageHeader title="Configurações" subtitle="Preferências gerais do Truco do Novo" />

      <Card className="admin-settings-card">
        <h3>Informações do campeonato</h3>
        <dl className="admin-settings-list">
          <div>
            <dt>Nome</dt>
            <dd>Truco do Novo</dd>
          </div>
          <div>
            <dt>Formato</dt>
            <dd>12 duplas · 2 grupos de 6 · mata-mata eliminatório</dd>
          </div>
          <div>
            <dt>Ambiente</dt>
            <dd>Dados simulados (em memória) — fase 1</dd>
          </div>
        </dl>
      </Card>

      <Card className="admin-settings-card admin-settings-danger">
        <h3>Zona de risco</h3>
        <p className="text-muted">
          Reiniciar o campeonato apaga o sorteio, os grupos e todos os resultados, restaurando os dados iniciais de demonstração.
        </p>
        <Button variant="danger" onClick={() => setShowConfirm(true)}>
          Reiniciar campeonato
        </Button>
      </Card>

      <Card className="admin-settings-card">
        <h3>Próxima fase</h3>
        <p className="text-muted">
          Autenticação real, banco de dados (Supabase/PostgreSQL), armazenamento e permissões avançadas serão habilitados após a
          validação desta primeira versão.
        </p>
      </Card>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Reiniciar campeonato?"
        description="Todos os dados de sorteio, grupos e resultados serão apagados. Esta ação não pode ser desfeita."
        tone="danger"
        confirmLabel="Reiniciar"
        isConfirming={isResetting}
        onConfirm={handleReset}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
