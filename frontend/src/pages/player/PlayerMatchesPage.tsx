import { useState } from "react";
import { BRACKET_ROUNDS, BRACKET_ROUND_LABEL, KNOCKOUT_PLAN, MATCHES_PER_GROUP, RESULTS_LOCKED_MESSAGE, buildGroupRounds, pairKey, type Match, type Player, type StandingRow, type Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { MatchGroupsList } from "../../components/truco/MatchGroupsList";
import { ScoreForm } from "../../components/truco/ScoreForm";
import { StandingsTable } from "../../components/truco/StandingsTable";
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
import "./PlayerMatchesPage.css";
import "../../components/truco/ResultsLockControl.css";

interface Data {
  teams: Team[];
  matches: Match[];
  players: Player[];
  standings: StandingRow[];
}

type Tab = "mine" | "rounds" | "knockout";

/** Um confronto da fase de grupos com a mesa e a rodada de referência. */
interface PlacedMatch {
  match: Match;
  round: number;
  table: number;
}

/**
 * Jogos: Meus Jogos (o que a dupla joga e lança), Todas as Rodadas (organização presencial em 7
 * rodadas de 3 mesas, com a dupla que descansa) e Mata-mata. Rodadas e mesas são só referência:
 * todo jogo pode ter o placar lançado a qualquer momento, em qualquer ordem — o único limite é o
 * cadeado global. A classificação vem da API (a mesma regra oficial), atualizada a cada placar.
 */
export function PlayerMatchesPage() {
  const { user } = useAuth();
  const myTeamId = user?.teamId ?? null;

  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, matches, players, standings] = await Promise.all([getTeams(), getMatches(), getPlayers(), getStandings("A")]);
    return { teams, matches, players, standings };
  }, [myTeamId]);

  useRealtimeMatches(refetch);
  const resultsLock = useResultsLock();
  const [tab, setTab] = useState<Tab>("mine");
  const entry = useResultEntry({ onSaved: refetch, onForbidden: resultsLock.refetch });

  if (isLoading) return <Loading fullHeight label="Carregando jogos..." />;
  if (error || !data) return <EmptyState icon={<Icon name="matches" size={36} />} tone="danger" title="Não foi possível carregar os jogos" description={error ?? ""} />;

  const groupMatches = data.matches.filter((match) => match.stage === "grupos");
  const knockoutMatches = data.matches.filter((match) => match.stage === "mata-mata");
  const done = groupMatches.filter((match) => match.result).length;
  const decided = (round: string) => knockoutMatches.some((match) => match.round === round && match.result !== null);
  const editionOver = decided(BRACKET_ROUND_LABEL.final) && decided(BRACKET_ROUND_LABEL.terceiro);
  const isMine = (match: Match) => myTeamId !== null && (match.teamAId === myTeamId || match.teamBId === myTeamId);
  const name = (teamId: string | null) => (teamId ? teamLabel(data.teams, teamId) : "—");

  // Rodadas visuais: duplas do grupo único em ordem alfabética, para todos verem as mesmas rodadas.
  const groupTeams = data.teams.filter((team) => team.status === "aprovada" && team.groupId === "A").sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const byPair = new Map(groupMatches.map((match) => [pairKey(match.teamAId, match.teamBId), match]));
  const rounds = buildGroupRounds(groupTeams.map((team) => team.id)).map((round) => ({
    ...round,
    placed: round.tables.flatMap((table) => {
      const match = byPair.get(pairKey(table.teamAId, table.teamBId));
      return match ? [{ match, round: round.round, table: table.table }] : [];
    }),
  }));
  const placedById = new Map(rounds.flatMap((round) => round.placed).map((item) => [item.match.id, item]));
  const roundsComplete = rounds.length > 0 && rounds.every((round) => round.placed.length === round.tables.length);

  /** Lançar/editar: só a própria dupla, cadeado aberto e edição em disputa. A API confere tudo de novo. */
  function action(match: Match) {
    if (!isMine(match) || resultsLock.locked || editionOver) return null;
    if (entry.openKey === match.id) {
      return (
        <ScoreForm
          teamAName={name(match.teamAId)}
          teamBName={name(match.teamBId)}
          isSubmitting={entry.isSubmitting}
          currentResult={match.result}
          onCancel={entry.close}
          onSubmit={(result) => entry.submit({ matchId: match.id, stage: match.stage, hasResult: match.result !== null }, result)}
        />
      );
    }
    return (
      <Button variant={match.result ? "ghost" : "primary"} size="sm" onClick={() => entry.open(match.id)}>
        {match.result ? "Editar resultado" : "Lançar resultado"}
      </Button>
    );
  }

  // Função de renderização (não componente): o formulário de placar aberto não é remontado a cada atualização.
  function renderRow(item: PlacedMatch) {
    const { match } = item;
    const mine = isMine(match);
    const winner = match.result ? (match.result.setsA > match.result.setsB ? match.teamAId : match.teamBId) : null;
    const side = (teamId: string, sets: number | null) => (
      <span className={`round-team${winner === teamId ? " is-winner" : ""}${teamId === myTeamId ? " is-mine" : ""}`}>
        <span className="round-team-name">{name(teamId)}</span>
        {sets !== null && <strong className="round-team-sets">{sets}</strong>}
      </span>
    );
    return (
      <li key={match.id} className={`round-match${mine ? " round-match-mine" : ""}${match.result ? " is-done" : ""}`} aria-label={`Rodada ${item.round}, mesa ${item.table}: ${name(match.teamAId)} contra ${name(match.teamBId)}`}>
        <div className="round-match-head">
          <span className="round-table">{tab === "mine" && item.round > 0 ? `Rodada ${item.round} · ` : ""}Mesa {item.table}</span>
          <span className={`round-status${match.result ? " is-done" : ""}`}>{match.result ? "Finalizado" : "Pendente"}</span>
        </div>
        <div className="round-match-teams">
          {side(match.teamAId, match.result?.setsA ?? null)}
          <span className="round-versus" aria-hidden="true">×</span>
          {side(match.teamBId, match.result?.setsB ?? null)}
        </div>
        {(() => { const node = action(match); return node ? <div className="round-match-action">{node}</div> : null; })()}
      </li>
    );
  }

  const myMatches = groupMatches.filter(isMine)
    .map((match) => placedById.get(match.id) ?? { match, round: 0, table: 0 })
    .sort((a, b) => Number(Boolean(a.match.result)) - Number(Boolean(b.match.result)) || a.round - b.round);
  const myKnockout = knockoutMatches.filter(isMine);

  const roundOf = (match: Match) => BRACKET_ROUNDS.find((round) => BRACKET_ROUND_LABEL[round] === match.round) ?? KNOCKOUT_PLAN.find((fixture) => fixture.label === match.round)?.round;
  const knockoutSections = BRACKET_ROUNDS.map((round) => ({ title: BRACKET_ROUND_LABEL[round], matches: knockoutMatches.filter((match) => roundOf(match) === round).sort((a, b) => a.order - b.order) }));

  const tabs: Array<{ value: Tab; label: string }> = [
    { value: "mine", label: "Meus Jogos" },
    { value: "rounds", label: "Todas as Rodadas" },
    ...(knockoutMatches.length > 0 || tab === "knockout" ? [{ value: "knockout" as Tab, label: "Mata-mata" }] : []),
  ];

  return (
    <div className="page-enter matches-page">
      <PageHeader title="Jogos" subtitle="Rodadas e mesas são só referência: jogue e lance o resultado em qualquer ordem" />

      {resultsLock.locked && !resultsLock.isLoading && (
        <p className="results-lock-notice" role="status"><Icon name="lock" size={20} />{RESULTS_LOCKED_MESSAGE}</p>
      )}

      <section className="matches-progress" aria-label="Andamento da fase de grupos">
        <p><strong>{done} de {MATCHES_PER_GROUP}</strong> partidas concluídas</p>
        <progress max={MATCHES_PER_GROUP} value={done} aria-label="Partidas concluídas" />
      </section>

      <div className="matches-tabs" role="tablist" aria-label="Ver jogos">
        {tabs.map((item) => (
          <button key={item.value} type="button" role="tab" aria-selected={tab === item.value} className={`matches-tab${tab === item.value ? " is-active" : ""}`} onClick={() => setTab(item.value)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === "mine" && (
        myTeamId === null ? (
          <EmptyState icon={<Icon name="matches" size={36} />} title="Você não está em uma dupla" description="Veja todos os confrontos em Todas as Rodadas." />
        ) : (
          <section aria-label="Meus jogos">
            <ul className="round-list">
              {myMatches.map(renderRow)}
            </ul>
            {myMatches.length > 0 && <p className="matches-hint">Pendente ou finalizado, qualquer jogo pode ter o placar lançado a qualquer momento.</p>}
            {myKnockout.length > 0 && (
              <MatchGroupsList matches={myKnockout} teams={data.teams} players={data.players} highlightTeamId={myTeamId} liveMatchId={entry.openKey} sections={[{ title: "Meus jogos no mata-mata", matches: myKnockout }]} renderActions={action} />
            )}
          </section>
        )
      )}

      {tab === "rounds" && (
        roundsComplete ? (
          <div className="rounds">
            {rounds.map((round) => {
              const finished = round.placed.filter((item) => item.match.result).length;
              const hasMine = round.placed.some((item) => isMine(item.match));
              return (
                <details key={round.round} className={`round${hasMine ? " round-has-mine" : ""}`} open={finished < round.placed.length || hasMine}>
                  <summary>
                    <span className="round-title">Rodada {round.round}</span>
                    <span className="round-count">{finished}/{round.placed.length} finalizados</span>
                  </summary>
                  <ul className="round-list">
                    {round.placed.map(renderRow)}
                  </ul>
                  {round.restingTeamId && (
                    <p className={`round-rest${round.restingTeamId === myTeamId ? " is-mine" : ""}`}><span aria-hidden="true">💤</span> Descansa: <strong>{name(round.restingTeamId)}</strong></p>
                  )}
                </details>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<Icon name="matches" size={36} />} title="Jogos ainda não gerados" description="As rodadas aparecem aqui quando o administrador gerar os 21 confrontos do grupo único." />
        )
      )}

      {tab === "knockout" && (
        knockoutMatches.length > 0 ? (
          <MatchGroupsList matches={knockoutMatches} teams={data.teams} players={data.players} highlightTeamId={myTeamId} liveMatchId={entry.openKey} sections={knockoutSections} renderActions={action} />
        ) : (
          <EmptyState icon={<Icon name="bracket" size={36} />} title="O mata-mata ainda não começou" description="Os jogos das quartas aparecem aqui sozinhos quando a fase de grupos terminar. Semifinais, disputa de 3º lugar e final entram conforme cada fase é decidida." />
        )
      )}

      <section className="matches-standings" aria-labelledby="matches-standings-title">
        <h2 id="matches-standings-title">Classificação ao vivo</h2>
        <StandingsTable rows={data.standings} teams={data.teams} players={data.players} highlightTeamId={myTeamId} />
      </section>

      {entry.dialog}
    </div>
  );
}
