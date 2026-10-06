import { Link } from "react-router-dom";
import type { DashboardStats, Match, MyQueueStatus, Player, StandingRow, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Icon } from "../../components/ui/Icon";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { TeamIdentityCard } from "../../components/truco/TeamIdentityCard";
import { TeamCampaignStats } from "../../components/truco/TeamCampaignStats";
import { TeamCrest } from "../../components/truco/TeamCrest";
import { TeamStrength } from "../../components/truco/TeamStrength";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { getTeams } from "../../services/teamsService";
import { getPlayers } from "../../services/playersService";
import { getMatches } from "../../services/matchesService";
import { getStandings } from "../../services/groupsService";
import { getDashboardStats } from "../../services/dashboardService";
import { getMyQueueStatus } from "../../services/scheduleService";
import { findTeam } from "../../utils/teamHelpers";
import { teamHue } from "../../utils/teamColor";
import "./PlayerHomePage.css";

interface HomeData {
  teams: Team[]; players: Player[]; myTeam?: Team; matches: Match[];
  standings: StandingRow[]; queue: MyQueueStatus | null;
  dashboard: DashboardStats | null; unavailable: string[];
}

export function PlayerHomePage() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useFetchData<HomeData>(async () => {
    const [teams, players, matches] = await Promise.all([getTeams(), getPlayers(), getMatches()]);
    const myTeam = teams.find(team => team.id === user?.teamId);
    const [queue, dashboard, standings] = await Promise.allSettled([
      getMyQueueStatus(), getDashboardStats(), myTeam?.groupId ? getStandings(myTeam.groupId) : Promise.resolve([]),
    ]);
    return {
      teams, players, matches, myTeam,
      queue: queue.status === "fulfilled" ? queue.value : null,
      dashboard: dashboard.status === "fulfilled" ? dashboard.value : null,
      standings: standings.status === "fulfilled" ? standings.value : [],
      unavailable: [queue.status === "rejected" ? "fila" : "", dashboard.status === "rejected" ? "fase" : "", standings.status === "rejected" ? "classificação" : ""].filter(Boolean),
    };
  }, [user?.teamId]);
  useRealtimeMatches(refetch);
  if (isLoading) return <Loading fullHeight label="Carregando sua campanha..." />;
  if (error || !data) return <EmptyState icon={<Icon name="team" size={36} />} tone="danger" title={error?.includes("202610050001_manual_edition_participation.sql") ? "Falta concluir uma atualização do campeonato" : "Não conseguimos carregar sua campanha"} description={error ?? "Tente atualizar as informações."} action={<Button onClick={refetch}>Tentar novamente</Button>} />;
  const myTeam = data.myTeam;
  const standing = data.standings.find(row => row.teamId === myTeam?.id);
  const next = myTeam ? data.matches.filter(match => match.status === "pendente" && [match.teamAId, match.teamBId].includes(myTeam.id)).sort((a,b) => (a.queuePosition ?? a.order) - (b.queuePosition ?? b.order))[0] : undefined;
  const opponentId = next ? (next.teamAId === myTeam?.id ? next.teamBId : next.teamAId) : null;
  const opponent = findTeam(data.teams, opponentId);
  const queueNote = data.queue?.matchesAhead == null ? "Acompanhe a ordem e prepare sua dupla." : data.queue.matchesAhead === 0 ? "Sua dupla é a próxima da fila." : `${data.queue.matchesAhead} jogo(s) antes do seu confronto.`;
  return <div className="player-home page-enter">
    <PageHeader title={`Olá, ${user?.name}!`} subtitle={`${data.dashboard?.currentPhase ?? "Sua campanha no campeonato"} · 5ª Edição 2026`} actions={<Link className="home-opening-link" to="/abertura">Rever abertura <Icon name="arrow" size={16} /></Link>} />
    {data.unavailable.length > 0 && <div className="home-notice" role="status">Não foi possível atualizar: {data.unavailable.join(", ")}. <Button variant="secondary" size="sm" onClick={refetch}>Atualizar</Button></div>}
    {myTeam ? <TeamIdentityCard team={myTeam} players={data.players} teams={data.teams} standing={standing} playerId={user?.playerId} /> : <EmptyState icon={<Icon name="team" size={36} />} title="Sua dupla está a caminho" description="Fale com o administrador para confirmar sua participação nesta edição." />}
    <div className="home-grid">
      <section className="home-next premium-panel" aria-labelledby="home-next-title">
        <header className="premium-panel-head"><h2 id="home-next-title">Próximo confronto</h2>{next && <Badge tone="info">{next.round} · Jogo {next.queuePosition ?? next.order + 1}</Badge>}</header>
        {next && myTeam ? <>
          <div className="home-versus">
            <div className="home-versus-side"><TeamCrest name={myTeam.name} hue={teamHue(myTeam.id, data.teams)} /><strong>{myTeam.name}</strong><span>Sua dupla</span></div>
            <span className="home-versus-x">contra</span>
            <div className="home-versus-side home-opponent"><TeamCrest name={opponent?.name ?? "A definir"} hue={teamHue(opponentId, data.teams)} /><strong>{opponent?.name ?? "A definir"}</strong><TeamStrength value={opponent?.strength} compact /></div>
          </div>
          <p className="home-match-note">{queueNote}</p>
        </> : <div className="home-next-empty">
          <p className="home-opponent">{myTeam ? "Nenhum confronto pendente." : "Aguardando confirmação da dupla."}</p>
          <p className="home-match-note">Os jogos definidos pelo campeonato aparecerão aqui.</p>
        </div>}
        <Link className="home-primary-link" to="/jogos">{next ? "Ver meus jogos" : "Acompanhar jogos"} <Icon name="arrow" size={18} /></Link>
      </section>
      {myTeam && <TeamCampaignStats standing={standing} />}
    </div>
    <section className="home-banner" aria-labelledby="home-banner-title">
      <div className="home-banner-copy">
        <h2 id="home-banner-title">O próximo caneco pode ter o nome de vocês.</h2>
        <p>Cada set vencido deixa {myTeam ? myTeam.name : "a sua dupla"} mais perto do título. Entrem para jogar a final.</p>
        <Link to="/maiores-campeoes">Conhecer os maiores campeões <Icon name="arrow" size={18} /></Link>
      </div>
      <span className="home-banner-trophy" aria-hidden="true"><Icon name="trophy" size={52} /></span>
    </section>
  </div>;
}
