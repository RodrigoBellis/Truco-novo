import { Link } from "react-router-dom";
import type { DashboardStats, Player, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Icon } from "../../components/ui/Icon";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { HomeTeamHero } from "../../components/truco/HomeTeamHero";
import { EditionCountdown } from "../../components/truco/EditionCountdown";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useResultsLock } from "../../hooks/useResultsLock";
import { getTeams } from "../../services/teamsService";
import { getPlayers } from "../../services/playersService";
import { getDashboardStats } from "../../services/dashboardService";
import "./PlayerHomePage.css";

interface HomeData {
  teams: Team[]; players: Player[]; myTeam?: Team;
  /** `null` quando o painel não respondeu: a faixa segue com data, contagem e cadeado. */
  dashboard: DashboardStats | null;
}

export function PlayerHomePage() {
  const { user } = useAuth();
  // A dupla vem sempre da conta autenticada; trocar de usuário refaz a busca.
  const { data, isLoading, error, refetch } = useFetchData<HomeData>(async () => {
    const [teams, players, dashboard] = await Promise.all([getTeams(), getPlayers(), getDashboardStats().catch(() => null)]);
    return { teams, players, dashboard, myTeam: user?.teamId ? teams.find(team => team.id === user.teamId) : undefined };
  }, [user?.teamId]);
  const lock = useResultsLock();
  if (isLoading || lock.isLoading) return <Loading fullHeight label="Carregando sua campanha..." />;
  if (error || !data) return <EmptyState icon={<Icon name="team" size={36} />} tone="danger" title={error?.includes("202610050001_manual_edition_participation.sql") ? "Falta concluir uma atualização do campeonato" : "Não conseguimos carregar sua campanha"} description={error ?? "Tente atualizar as informações."} action={<Button onClick={refetch}>Tentar novamente</Button>} />;
  const myTeam = data.myTeam;
  return <div className="player-home page-enter">
    <PageHeader title={`Olá, ${user?.name}!`} subtitle="Sua campanha na 5ª Edição · 2026" actions={<Link className="home-opening-link" to="/abertura">Rever abertura <Icon name="arrow" size={16} /></Link>} />
    {!data.dashboard && <div className="home-notice" role="status">Não foi possível confirmar a situação da edição. <Button variant="secondary" size="sm" onClick={refetch}>Atualizar</Button></div>}
    {myTeam ? <HomeTeamHero team={myTeam} players={data.players} teams={data.teams} playerId={user?.playerId} /> : <EmptyState icon={<Icon name="team" size={36} />} title="Sua dupla está a caminho" description="Fale com o administrador para confirmar sua participação nesta edição." />}
    <EditionCountdown locked={lock.locked} champion={data.dashboard?.champion} />
  </div>;
}
