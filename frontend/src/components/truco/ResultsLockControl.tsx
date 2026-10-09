import { useState } from "react";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Icon } from "../ui/Icon";
import { useResultsLock } from "../../hooks/useResultsLock";
import { useToast } from "../../hooks/useToast";
import { setResultsLock } from "../../services/adminService";
import { ApiError } from "../../services/api";
import "./ResultsLockControl.css";

/**
 * Cadeado global de resultados no painel do administrador. Fechado, os jogadores entram e
 * consultam tudo, mas não lançam nem editam placar; o administrador continua podendo. Abrir
 * ou fechar pede confirmação, para um toque sem querer não mudar o campeonato.
 */
export function ResultsLockControl() {
  const { locked, isLoading, error, refetch } = useResultsLock();
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function toggle() {
    setIsSaving(true);
    try {
      const next = await setResultsLock(!locked);
      showToast("success", next.locked ? "Resultados bloqueados. Os jogadores não podem mais lançar placar." : "Resultados liberados. Os jogadores já podem lançar placar.");
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível alterar o cadeado de resultados.");
    } finally {
      setIsSaving(false);
      setConfirming(false);
    }
  }

  if (isLoading) return <section className="results-lock" aria-label="Lançamento de resultados" aria-busy="true"><p className="results-lock-note">Consultando o cadeado de resultados…</p></section>;

  return (
    <section className={`results-lock ${locked ? "results-lock-closed" : "results-lock-open"}`} aria-label="Lançamento de resultados">
      <span className="results-lock-icon" aria-hidden="true"><Icon name={locked ? "lock" : "unlock"} size={26} /></span>
      <div className="results-lock-copy">
        <h2>Lançamento de resultados</h2>
        <p className="results-lock-state" role="status">{locked ? "Bloqueado" : "Liberado"}</p>
        <p className="results-lock-note">
          {error
            ? "Não foi possível consultar o estado agora; por segurança ele é tratado como bloqueado."
            : locked
              ? "Os jogadores entram e consultam tudo, mas não lançam nem editam placar. Você continua podendo."
              : "Os jogadores podem lançar e corrigir o placar dos próprios jogos."}
        </p>
      </div>
      <Button variant={locked ? "primary" : "secondary"} onClick={() => setConfirming(true)}>
        {locked ? "Liberar resultados" : "Bloquear resultados"}
      </Button>

      <ConfirmDialog
        isOpen={confirming}
        title={locked ? "Liberar lançamento de resultados para todos os jogadores?" : "Bloquear o lançamento de resultados?"}
        description={locked
          ? "A partir da confirmação, cada dupla pode lançar e corrigir o placar dos próprios jogos."
          : "Nenhum jogador conseguirá lançar ou editar placar até você liberar de novo. Os resultados já lançados continuam valendo."}
        confirmLabel={locked ? "Liberar" : "Bloquear"}
        tone={locked ? "default" : "danger"}
        isConfirming={isSaving}
        onConfirm={() => void toggle()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
