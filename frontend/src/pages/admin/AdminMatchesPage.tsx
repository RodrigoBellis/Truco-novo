import { useState } from "react";
import type { Match, MatchResult, Player, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { MatchGroupsList } from "../../components/truco/MatchGroupsList";
import { ScoreForm } from "../../components/truco/ScoreForm";
import { useFetchData } from "../../hooks/useFetchData";
import { useToast } from "../../hooks/useToast";
import { getTeams } from "../../services/teamsService";
import { getMatches, getMatchResultAudit, recordMatchResult, type MatchResultAuditEntry } from "../../services/matchesService";
import { getPlayers } from "../../services/playersService";
import { teamLabel } from "../../utils/teamHelpers";
import { ApiError } from "../../services/api";

interface Data {
  teams: Team[];
  matches: Match[];
  players: Player[];
}

export function AdminMatchesPage() {
  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, matches, players] = await Promise.all([getTeams(), getMatches({ stage: "grupos" }), getPlayers()]);
    return { teams, matches, players };
  });
  const { showToast } = useToast();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Correção de um resultado já salvo aguardando confirmação do admin. */
  const [pendingEdit, setPendingEdit] = useState<{ matchId: string; result: MatchResult } | null>(null);
  const [audit, setAudit] = useState<MatchResultAuditEntry[] | null>(null);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  async function toggleAudit() {
    if (audit) { setAudit(null); return; }
    setIsLoadingAudit(true);
    try { setAudit(await getMatchResultAudit()); }
    catch (err) { showToast("error", err instanceof ApiError ? err.message : "Não foi possível carregar o histórico de alterações."); }
    finally { setIsLoadingAudit(false); }
  }

  async function save(matchId: string, result: MatchResult, isEdit: boolean) {
    setIsSubmitting(true);
    try {
      await recordMatchResult(matchId, result);
      showToast("success", isEdit ? "Resultado atualizado com sucesso." : "Resultado registrado com sucesso.");
      setExpandedId(null);
      setPendingEdit(null);
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível registrar o resultado.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(match: Match, result: MatchResult) {
    // Sobrescrever um placar já salvo exige confirmação — recalcula a classificação.
    if (match.status === "realizado") {
      setPendingEdit({ matchId: match.id, result });
      return;
    }
    void save(match.id, result, false);
  }

  if (isLoading) return <Loading fullHeight label="Carregando jogos..." />;
  if (error || !data) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar os jogos" description={error ?? ""} />;

  if (data.matches.length === 0) {
    return (
      <div>
        <PageHeader title="Jogos" subtitle="Fase de grupos" />
        <EmptyState icon="🎴" title="Jogos ainda não gerados" description="Depois de definir cinco duplas em cada grupo, gere os confrontos na área Grupos." />
        <section className="match-audit-panel" aria-label="Alterações de resultados">
          <Button variant="secondary" isLoading={isLoadingAudit} onClick={() => void toggleAudit()}>{audit ? "Ocultar alterações" : "Ver alterações"}</Button>
          {audit && <ol>{audit.map((entry) => <li key={entry.id}>{entry.actorName} · {entry.action} · {entry.createdAt}</li>)}</ol>}
        </section>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <PageHeader title="Jogos" subtitle="Fase de grupos — registre os resultados de cada confronto" actions={<Button variant="secondary" isLoading={isLoadingAudit} onClick={() => void toggleAudit()}>{audit ? "Ocultar alterações" : "Ver alterações"}</Button>} />

      {audit && <section className="match-audit-panel" aria-label="Alterações de resultados">
        <h2>Alterações de resultados</h2>
        {audit.length === 0 ? <p>Nenhuma alteração registrada nesta edição.</p> : <ol>
          {audit.map((entry) => {
            const previous = entry.metadata.previous;
            const next = entry.metadata.next;
            return <li key={entry.id}>
              <strong>{entry.action === "result_updated" ? "Resultado corrigido" : "Resultado lançado"}</strong>
              <span>{entry.actorName} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.createdAt))}</span>
              <span>{previous ? `${previous.setsA}×${previous.setsB} → ` : ""}{next ? `${next.setsA}×${next.setsB}` : "Resultado indisponível"}</span>
              <small>Partida {entry.matchId ?? "removida"}</small>
            </li>;
          })}
        </ol>}
      </section>}

      <MatchGroupsList
        matches={data.matches}
        teams={data.teams}
        players={data.players}
        liveMatchId={expandedId}
        renderActions={(match) => (
          <div>
            {expandedId === match.id ? (
              <ScoreForm
                teamAName={teamLabel(data.teams, match.teamAId)}
                teamBName={teamLabel(data.teams, match.teamBId)}
                isSubmitting={isSubmitting}
                currentResult={match.result}
                onCancel={() => setExpandedId(null)}
                onSubmit={(result) => handleSubmit(match, result)}
              />
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setExpandedId(match.id)}>
                {match.status === "realizado" ? "Editar resultado" : "Registrar resultado"}
              </Button>
            )}
          </div>
        )}
      />

      <ConfirmDialog
        isOpen={pendingEdit !== null}
        title="Substituir resultado já salvo?"
        description={
          pendingEdit
            ? `O placar deste jogo será corrigido para ${pendingEdit.result.setsA}x${pendingEdit.result.setsB}. A classificação e a pontuação serão recalculadas automaticamente.`
            : undefined
        }
        confirmLabel="Salvar correção"
        isConfirming={isSubmitting}
        onConfirm={() => pendingEdit && void save(pendingEdit.matchId, pendingEdit.result, true)}
        onCancel={() => setPendingEdit(null)}
      />
    </div>
  );
}
