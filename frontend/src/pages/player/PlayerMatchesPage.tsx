import { useState } from "react";
import type { GroupId, Match, MatchResult, Player, StandingRow, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { MatchGroupsList } from "../../components/truco/MatchGroupsList";
import { ScoreForm } from "../../components/truco/ScoreForm";
import { MatchesHero } from "../../components/truco/MatchesHero";
import { buildOpponentInsight } from "../../utils/opponentInsight";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { useToast } from "../../hooks/useToast";
import { getTeams } from "../../services/teamsService";
import { getMatches, recordMatchResult } from "../../services/matchesService";
import { getPlayers } from "../../services/playersService";
import { getStandings } from "../../services/groupsService";
import { teamLabel } from "../../utils/teamHelpers";
import { teamHue } from "../../utils/teamColor";
import { groupToneClass } from "../../utils/groupColor";
import { ApiError } from "../../services/api";
import "./PlayerMatchesPage.css";

interface Data {
  teams: Team[];
  matches: Match[];
  players: Player[];
  groupId: GroupId | null;
  standings: StandingRow[];
}

type GroupFilter = "mine" | GroupId | "all";
type StatusFilter = "all" | "upcoming" | "finished";

export function PlayerMatchesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const myTeamId = user?.teamId ?? null;

  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, matches, players] = await Promise.all([getTeams(), getMatches(), getPlayers()]);
    const myTeam = teams.find((t) => t.id === myTeamId);
    const groupId = myTeam?.groupId ?? null;
    // Classificação real do grupo — base das mensagens do próximo confronto.
    const standings = groupId ? await getStandings(groupId) : [];
    return { teams, players, groupId, standings, matches };
  }, [myTeamId]);

  useRealtimeMatches(refetch);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("mine");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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
  if (error) return <EmptyState icon={<Icon name="matches" size={36} />} tone="danger" title="Não foi possível carregar os jogos" description={error} />;

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

  const myTeam = myTeamId ? data?.teams.find((team) => team.id === myTeamId) : undefined;
  const myPendingCount = myTeamId
    ? (data?.matches ?? []).filter((m) => m.status === "pendente" && (m.teamAId === myTeamId || m.teamBId === myTeamId)).length
    : 0;

  const isMineMatch = (match: Match) => myTeamId !== null && (match.teamAId === myTeamId || match.teamBId === myTeamId);
  const queueOrder = (match: Match) => match.queuePosition ?? match.order + 1;

  const visibleMatches = (data?.matches ?? []).filter((match) => {
    const inSelectedGroup = groupFilter === "all" || (groupFilter === "mine"
      ? isMineMatch(match)
      : match.groupId === groupFilter);
    const inSelectedStatus = statusFilter === "all" || (statusFilter === "upcoming" ? match.status === "pendente" : match.status === "realizado");
    return inSelectedGroup && inSelectedStatus;
  });

  return (
    <div className="page-enter">
      <PageHeader title="Jogos" subtitle="Acompanhe a ordem, os confrontos e os placares da edição" />

      {data && myTeam && (
        <MatchesHero
          teamName={myTeam.name}
          hue={teamHue(myTeam.id, data.teams)}
          groupId={data.groupId}
          standing={data.standings.find((row) => row.teamId === myTeam.id)}
          pendingCount={myPendingCount}
          next={
            nextMatch && opponentId && data.groupId
              ? {
                  opponentName: teamLabel(data.teams, opponentId),
                  insight: buildOpponentInsight({
                    matchId: nextMatch.id,
                    groupId: data.groupId,
                    myTeamId: myTeam.id,
                    opponentTeamId: opponentId,
                    standings: data.standings,
                  }),
                }
              : null
          }
        />
      )}

      <div className="matches-filter-section">
        <div className="matches-group-filters" role="tablist" aria-label="Filtrar jogos por grupo">
          {([{ value: "mine", label: "Meus Jogos" }, { value: "A", label: "Grupo A" }, { value: "B", label: "Grupo B" }, { value: "all", label: "Todos" }] as const).map((filter) => <button key={filter.value} type="button" role="tab" aria-selected={groupFilter === filter.value} className={`matches-filter-chip${groupFilter === filter.value ? " matches-filter-chip-active" : ""}`} onClick={() => setGroupFilter(filter.value)}>{(filter.value === "A" || filter.value === "B") && <span className={`matches-filter-dot ${groupToneClass(filter.value)}`} aria-hidden="true" />}{filter.label}</button>)}
        </div>
        <label className="matches-status-filter">Situação <select aria-label="Filtrar por situação" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="all">Todos</option><option value="upcoming">Próximos</option><option value="finished">Finalizados</option></select></label>
      </div>

      {data && visibleMatches.length > 0 ? (
        <MatchGroupsList
          matches={visibleMatches}
          teams={data.teams}
          players={data.players}
          highlightTeamId={user?.teamId}
          liveMatchId={expandedId}
          sections={
            // Em Meus Jogos o que importa é o que falta jogar e o que já foi jogado (mais recente primeiro).
            groupFilter === "mine"
              ? [
                  { title: "Próximos confrontos", matches: visibleMatches.filter((m) => m.status === "pendente").sort((a, b) => queueOrder(a) - queueOrder(b)) },
                  { title: "Já jogados", matches: visibleMatches.filter((m) => m.status === "realizado").sort((a, b) => queueOrder(b) - queueOrder(a)) },
                ]
              : undefined
          }
          renderActions={(match) => {
            // Só a própria dupla lança/corrige o placar. Jogos realizados de outras duplas
            // podem aparecer na lista (classificação do grupo), mas sem ação disponível.
            if (!isMineMatch(match)) return null;

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
                  <Button variant={match.status === "realizado" ? "ghost" : "primary"} size="sm" onClick={() => setExpandedId(match.id)}>
                    {match.status === "realizado" ? "Editar resultado" : "Lançar resultado"}
                  </Button>
                )}
              </div>
            );
          }}
        />
      ) : (
        <EmptyState icon={<Icon name="matches" size={36} />} title="Nenhum jogo neste filtro" description={groupFilter === "mine" ? "Sua dupla ainda não tem jogos nesta situação. Você também pode consultar os Grupos A e B." : "Não encontramos partidas com esses filtros."} />
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
