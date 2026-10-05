import { useState } from "react";
import type { GroupId, Match, MatchResult, StandingRow, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { MatchGroupsList } from "../../components/truco/MatchGroupsList";
import { ScoreForm } from "../../components/truco/ScoreForm";
import { NextOpponentCard } from "../../components/truco/NextOpponentCard";
import { buildOpponentInsight } from "../../utils/opponentInsight";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { useToast } from "../../hooks/useToast";
import { getTeams } from "../../services/teamsService";
import { getMatches, recordMatchResult } from "../../services/matchesService";
import { getStandings } from "../../services/groupsService";
import { teamLabel } from "../../utils/teamHelpers";
import { ApiError } from "../../services/api";

interface Data {
  teams: Team[];
  matches: Match[];
  groupId: GroupId | null;
  standings: StandingRow[];
}

export function PlayerMatchesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const myTeamId = user?.teamId ?? null;

  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, matches] = await Promise.all([getTeams(), getMatches()]);
    const myTeam = teams.find((t) => t.id === myTeamId);
    const groupId = myTeam?.groupId ?? null;
    // Classificação real do grupo — base das mensagens do próximo confronto.
    const standings = groupId ? await getStandings(groupId) : [];
    // Pendentes de qualquer dupla visível + os jogos JÁ REALIZADOS da própria dupla,
    // para que o placar lançado continue à vista e possa ser corrigido.
    return {
      teams,
      groupId,
      standings,
      matches: matches.filter(
        (m) =>
          m.status === "pendente" ||
          (myTeamId !== null && (m.teamAId === myTeamId || m.teamBId === myTeamId)),
      ),
    };
  }, [myTeamId]);

  useRealtimeMatches(refetch);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Correção de um placar já lançado aguardando confirmação. */
  const [pendingEdit, setPendingEdit] = useState<{ matchId: string; result: MatchResult } | null>(null);

  async function save(matchId: string, result: MatchResult, isEdit: boolean) {
    setIsSubmitting(true);
    try {
      await recordMatchResult(matchId, result);
      showToast(
        "success",
        isEdit
          ? "Resultado atualizado com sucesso! A classificação já foi recalculada."
          : "Resultado registrado! A classificação do seu grupo já foi atualizada.",
      );
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
    // Sobrescrever um placar já lançado exige confirmação — recalcula a classificação.
    if (match.status === "realizado") {
      setPendingEdit({ matchId: match.id, result });
      return;
    }
    void save(match.id, result, false);
  }

  if (isLoading) return <Loading fullHeight label="Carregando jogos..." />;
  if (error) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar os jogos" description={error} />;

  // Próximo confronto da dupla: o pendente de menor posição na fila.
  const nextMatch = myTeamId
    ? (data?.matches ?? [])
        .filter((m) => m.status === "pendente" && (m.teamAId === myTeamId || m.teamBId === myTeamId))
        .sort((a, b) => (a.queuePosition ?? a.order) - (b.queuePosition ?? b.order))[0]
    : undefined;

  const opponentId = nextMatch
    ? nextMatch.teamAId === myTeamId
      ? nextMatch.teamBId
      : nextMatch.teamAId
    : null;

  return (
    <div className="page-enter">
      <PageHeader title="Jogos" subtitle="Registre o placar assim que a partida terminar — dá para corrigir depois se errar" />

      {data && nextMatch && opponentId && myTeamId && data.groupId && (
        <NextOpponentCard
          opponentName={teamLabel(data.teams, opponentId)}
          insight={buildOpponentInsight({
            matchId: nextMatch.id,
            groupId: data.groupId,
            myTeamId,
            opponentTeamId: opponentId,
            standings: data.standings,
          })}
        />
      )}
      {data && data.matches.length > 0 ? (
        <MatchGroupsList
          matches={data.matches}
          teams={data.teams}
          highlightTeamId={user?.teamId}
          liveMatchId={expandedId}
          renderActions={(match) => {
            // Só a própria dupla lança/corrige o placar. Jogos realizados de outras duplas
            // podem aparecer na lista (classificação do grupo), mas sem ação disponível.
            const isMine = match.teamAId === user?.teamId || match.teamBId === user?.teamId;
            if (!isMine) return null;

            return (
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
            );
          }}
        />
      ) : (
        <EmptyState icon="🎴" title="Nenhum jogo pendente" description="Sua dupla não tem confrontos pendentes. O administrador definirá os jogos depois de formar os grupos." />
      )}

      <ConfirmDialog
        isOpen={pendingEdit !== null}
        title="Substituir o resultado já lançado?"
        description={
          pendingEdit
            ? `O placar deste jogo será corrigido para ${pendingEdit.result.setsA}x${pendingEdit.result.setsB}. A classificação e a pontuação do seu grupo serão recalculadas automaticamente.`
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
