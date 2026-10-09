import { useState, type ReactNode } from "react";
import type { MatchResult, MatchStage } from "@truco/shared";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { recordMatchResult } from "../services/matchesService";
import { ApiError } from "../services/api";
import { useToast } from "./useToast";

/** O jogo que está recebendo placar. */
export interface ResultTarget {
  matchId: string;
  stage: MatchStage;
  /** Já existe placar salvo: salvar de novo é correção e pede confirmação. */
  hasResult: boolean;
}

interface ResultEntryOptions {
  /** Placar gravado: a tela recarrega os dados. */
  onSaved: () => void;
  /** A API recusou (403): cadeado fechado, edição encerrada ou jogo de outra dupla. */
  onForbidden?: () => void;
  /** Texto próprio para o toast de sucesso; sem retorno, vale o texto padrão da fase. */
  successMessage?: (target: ResultTarget, result: MatchResult, isEdit: boolean) => string | null | undefined;
}

const COPY: Record<MatchStage, { saved: string; edited: string; confirm: (score: string) => string }> = {
  grupos: {
    saved: "Resultado registrado! A classificação do seu grupo já foi atualizada.",
    edited: "Resultado atualizado com sucesso! A classificação já foi recalculada.",
    confirm: (score) => `O placar deste jogo será corrigido para ${score}. A classificação e a pontuação do seu grupo serão recalculadas automaticamente.`,
  },
  "mata-mata": {
    saved: "Resultado registrado! O chaveamento já foi atualizado.",
    edited: "Resultado corrigido. O chaveamento já foi atualizado.",
    confirm: (score) => `O placar deste jogo será corrigido para ${score}. Se o vencedor mudar, a vaga na fase seguinte muda junto. Não é possível trocar o vencedor depois que a fase seguinte foi disputada.`,
  },
};

/**
 * Fluxo único de lançar e corrigir placar, usado por Jogos, Mata-mata e pelo mata-mata do
 * administrador: um formulário aberto por vez, confirmação antes de sobrescrever um placar,
 * toast com a mensagem da API quando ela recusa e fechamento do formulário num 403.
 */
export function useResultEntry({ onSaved, onForbidden, successMessage }: ResultEntryOptions) {
  const { showToast } = useToast();
  /** Chave do formulário aberto (cada tela escolhe a sua; em geral o id do jogo). */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{ target: ResultTarget; result: MatchResult } | null>(null);

  async function save(target: ResultTarget, result: MatchResult, isEdit: boolean) {
    setIsSubmitting(true);
    try {
      await recordMatchResult(target.matchId, result);
      const copy = COPY[target.stage];
      showToast("success", successMessage?.(target, result, isEdit) ?? (isEdit ? copy.edited : copy.saved));
      setOpenKey(null);
      setPendingEdit(null);
      onSaved();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "A conexão caiu e não foi possível confirmar a gravação. Confira o placar atualizado antes de tentar novamente.");
      setPendingEdit(null);
      if (err instanceof ApiError && err.resultSaved) {
        setOpenKey(null);
        onSaved();
        return;
      }
      if (!(err instanceof ApiError)) {
        setOpenKey(null);
        onSaved();
        return;
      }
      // Recusa da API: o administrador pode ter fechado o cadeado (ou a edição acabou) com a
      // tela aberta. O formulário fecha e a tela volta a mostrar o estado real.
      if (err instanceof ApiError && (err.status === 403 || err.status === 409)) {
        setOpenKey(null);
        onForbidden?.();
        onSaved();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function submit(target: ResultTarget, result: MatchResult) {
    if (target.hasResult) {
      setPendingEdit({ target, result });
      return;
    }
    void save(target, result, false);
  }

  const dialog: ReactNode = (
    <ConfirmDialog
      isOpen={pendingEdit !== null}
      title="Substituir o resultado já lançado?"
      description={pendingEdit ? COPY[pendingEdit.target.stage].confirm(`${pendingEdit.result.setsA}x${pendingEdit.result.setsB}`) : undefined}
      confirmLabel="Salvar correção"
      isConfirming={isSubmitting}
      onConfirm={() => pendingEdit && void save(pendingEdit.target, pendingEdit.result, true)}
      onCancel={() => setPendingEdit(null)}
    />
  );

  return { openKey, open: setOpenKey, close: () => setOpenKey(null), isSubmitting, submit, dialog };
}
