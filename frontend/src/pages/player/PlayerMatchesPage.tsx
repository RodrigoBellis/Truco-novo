import { useState } from "react";
import { BRACKET_ROUNDS, BRACKET_ROUND_LABEL, KNOCKOUT_PLAN, RESULTS_LOCKED_MESSAGE, type GroupId, type Match, type Player, type StandingRow, type Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { MatchGroupsList } from "../../components/truco/MatchGroupsList";
import { ScoreForm } from "../../components/truco/ScoreForm";
import { MatchesHero } from "../../components/truco/MatchesHero";
import { buildOpponentInsight, type OpponentInsight } from "../../utils/opponentInsight";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { useResultEntry } from "../../hooks/useResultEntry";
import { useResultsLock } from "../../hooks/useResultsLock";
import { getTeams } from "../../services/teamsService";
import { getMatches } from "../../services/matchesService";
import { getPlayers } from "../../services/playersService";
import { getStandings } from "../../services/groupsService";
import { teamLabel } from "../../utils/teamHelpers";
import { teamHue } from "../../utils/teamColor";
import { groupToneClass } from "../../utils/groupColor";
import "./PlayerMatchesPage.css";
import "../../components/truco/ResultsLockControl.css";

interface Data {
  teams: Team[];
  matches: Match[];
  players: Player[];
  groupId: GroupId | null;
  standings: StandingRow[];
}

type GroupFilter = "mine" | GroupId | "knockout" | "all";

const FILTERS: ReadonlyArray<{ value: GroupFilter; label: string }> = [
  { value: "mine", label: "Meus Jogos" },
  { value: "A", label: "Grupo A" },
  { value: "B", label: "Grupo B" },
  { value: "knockout", label: "Mata-mata" },
  { value: "all", label: "Todos" },
];

/** No mata-mata a tabela do grupo não diz nada sobre o confronto: só a fase e o que está em jogo. */
function knockoutInsight(match: Match): OpponentInsight {
  return { tone: "abertura", message: "Mata-mata: quem vence avança, quem perde se despede da edição.", positionLabel: match.round, medal: null };
}
type StatusFilter = "all" | "upcoming" | "finished";

export function PlayerMatchesPage() {
  const { user } = useAuth();

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
  // Cadeado global: fechado, o jogador vê tudo mas não lança nem edita placar.
  const resultsLock = useResultsLock();

  const [groupFilter, setGroupFilter] = useState<GroupFilter>("mine");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Mesmo fluxo de lançar/corrigir da tela Mata-mata (confirmação, toasts por fase, 403).
  const entry = useResultEntry({ onSaved: refetch, onForbidden: resultsLock.refetch });

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
      : groupFilter === "knockout"
        ? match.stage === "mata-mata"
        : match.groupId === groupFilter);
    const inSelectedStatus = statusFilter === "all" || (statusFilter === "upcoming" ? match.status === "pendente" : match.status === "realizado");
    return inSelectedGroup && inSelectedStatus;
  });

  // Filtro Mata-mata: uma seção por fase, na ordem do chaveamento. O backend grava em
  // match.round o nome da fase ("Repescagem", "Quartas de final", "Semifinal", "Final"). Se algum
  // jogo vier com outro nome de rodada, vale o agrupamento padrão para ele não sumir.
  const roundOf = (match: Match) => BRACKET_ROUNDS.find((round) => BRACKET_ROUND_LABEL[round] === match.round) ?? KNOCKOUT_PLAN.find((fixture) => fixture.label === match.round)?.round;
  // Final com placar: a edição acabou e a API recusa qualquer lançamento de jogador.
  const editionOver = (data?.matches ?? []).some((match) => match.stage === "mata-mata" && match.round === BRACKET_ROUND_LABEL.final && match.result !== null);
  const knockoutSections = groupFilter === "knockout" && visibleMatches.every((match) => roundOf(match))
    ? BRACKET_ROUNDS.map((round) => ({ title: BRACKET_ROUND_LABEL[round], matches: visibleMatches.filter((match) => roundOf(match) === round).sort((a, b) => a.order - b.order) }))
    : undefined;

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
            nextMatch && opponentId && nextMatch.stage === "mata-mata"
              ? { opponentName: teamLabel(data.teams, opponentId), insight: knockoutInsight(nextMatch) }
              : nextMatch && opponentId && data.groupId
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

      {resultsLock.locked && !resultsLock.isLoading && (
        <p className="results-lock-notice" role="status"><Icon name="lock" size={20} />{RESULTS_LOCKED_MESSAGE}</p>
      )}

      <div className="matches-filter-section">
        <div className="matches-group-filters" role="tablist" aria-label="Filtrar jogos por grupo">
          {FILTERS.map((filter) => <button key={filter.value} type="button" role="tab" aria-selected={groupFilter === filter.value} className={`matches-filter-chip${groupFilter === filter.value ? " matches-filter-chip-active" : ""}`} onClick={() => setGroupFilter(filter.value)}>{(filter.value === "A" || filter.value === "B") && <span className={`matches-filter-dot ${groupToneClass(filter.value)}`} aria-hidden="true" />}{filter.label}</button>)}
        </div>
        <label className="matches-status-filter">Situação <select aria-label="Filtrar por situação" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="all">Todos</option><option value="upcoming">Próximos</option><option value="finished">Finalizados</option></select></label>
      </div>

      {data && visibleMatches.length > 0 ? (
        <MatchGroupsList
          matches={visibleMatches}
          teams={data.teams}
          players={data.players}
          highlightTeamId={user?.teamId}
          liveMatchId={entry.openKey}
          sections={
            // Em Meus Jogos o que importa é o que falta jogar e o que já foi jogado (mais recente primeiro).
            groupFilter === "mine"
              ? [
                  { title: "Próximos confrontos", matches: visibleMatches.filter((m) => m.status === "pendente").sort((a, b) => queueOrder(a) - queueOrder(b)) },
                  { title: "Já jogados", matches: visibleMatches.filter((m) => m.status === "realizado").sort((a, b) => queueOrder(b) - queueOrder(a)) },
                ]
              : knockoutSections
          }
          renderActions={(match) => {
            // Só a própria dupla lança/corrige o placar. Jogos realizados de outras duplas
            // podem aparecer na lista (classificação do grupo), mas sem ação disponível.
            if (!isMineMatch(match)) return null;
            // Com o cadeado fechado não há ação: o aviso no topo da tela explica o motivo.
            if (resultsLock.locked || editionOver) return null;

            return (
              <div>
                {entry.openKey === match.id ? (
                  <ScoreForm
                    teamAName={teamLabel(data.teams, match.teamAId)}
                    teamBName={teamLabel(data.teams, match.teamBId)}
                    isSubmitting={entry.isSubmitting}
                    currentResult={match.result}
                    onCancel={entry.close}
                    onSubmit={(result) => entry.submit({ matchId: match.id, stage: match.stage, hasResult: match.status === "realizado" }, result)}
                  />
                ) : (
                  <Button variant={match.status === "realizado" ? "ghost" : "primary"} size="sm" onClick={() => entry.open(match.id)}>
                    {match.status === "realizado" ? "Editar resultado" : "Lançar resultado"}
                  </Button>
                )}
              </div>
            );
          }}
        />
      ) : (
        groupFilter === "knockout" && statusFilter === "all" ? (
        <EmptyState icon={<Icon name="bracket" size={36} />} title="O mata-mata ainda não começou" description="Os jogos da repescagem aparecem aqui sozinhos quando a fase de grupos terminar. Quartas, semifinais e final entram conforme cada fase é decidida." />
      ) : (
        <EmptyState icon={<Icon name="matches" size={36} />} title="Nenhum jogo neste filtro" description={groupFilter === "mine" ? "Sua dupla ainda não tem jogos nesta situação. Você também pode consultar os Grupos A e B." : "Não encontramos partidas com esses filtros."} />
      )
      )}

      {entry.dialog}
    </div>
  );
}
