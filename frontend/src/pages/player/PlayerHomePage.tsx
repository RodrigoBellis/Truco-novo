import { Link } from "react-router-dom";
import type { DashboardStats, QueueStatus, StandingRow, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Icon } from "../../components/ui/Icon";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { AnimatedBorderCard } from "../../components/ui/AnimatedBorderCard";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { getTeams } from "../../services/teamsService";
import { getStandings } from "../../services/groupsService";
import { getDashboardStats } from "../../services/dashboardService";
import { getMyQueueStatus } from "../../services/scheduleService";
import { teamLabel } from "../../utils/teamHelpers";
import "./PlayerHomePage.css";

const SHORTCUTS = [
  { to: "/mesas-agora", icon: "tables", label: "Ordem dos Jogos", hint: "Veja a fila de confrontos" },
  { to: "/jogos", icon: "matches", label: "Jogos", hint: "Próximos confrontos" },
  { to: "/classificacao", icon: "standings", label: "Classificação", hint: "Tabela do seu grupo" },
  { to: "/hall-da-fama", icon: "trophy", label: "Hall da Fama", hint: "Campeões de todas as edições" },
] as const;

const STATUS_LABEL: Record<QueueStatus, string> = {
  aguardando: "Aguardando",
  "prepare-se": "Prepare-se",
  "proximo-jogo": "Próximo jogo",
  "em-jogo": "Em jogo",
  finalizado: "Finalizado",
};

const STATUS_TONE: Record<QueueStatus, "neutral" | "gold" | "green" | "danger" | "info"> = {
  aguardando: "neutral",
  "prepare-se": "info",
  "proximo-jogo": "gold",
  "em-jogo": "danger",
  finalizado: "green",
};

interface HomeData {
  teams: Team[];
  myTeam: Team | undefined;
  queueStatus: Awaited<ReturnType<typeof getMyQueueStatus>>;
  standings: StandingRow[];
  dashboard: DashboardStats;
}

export function PlayerHomePage() {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useFetchData<HomeData>(async () => {
    const teams = await getTeams();
    const myTeam = teams.find((team) => team.id === user?.teamId);
    const [queueStatus, dashboard] = await Promise.all([getMyQueueStatus(), getDashboardStats()]);
    const standings = myTeam?.groupId ? await getStandings(myTeam.groupId) : [];
    return { teams, myTeam, queueStatus, standings, dashboard };
  }, [user?.teamId]);

  useRealtimeMatches(refetch);

  if (isLoading) return <Loading fullHeight label="Carregando seu painel..." />;
  if (error || !data) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar seus dados" description={error ?? ""} />;

  const { teams, myTeam, queueStatus, standings, dashboard } = data;
  const myPosition = standings.find((row) => row.teamId === myTeam?.id)?.position;
  const opponentName = queueStatus.opponentTeamId ? teamLabel(teams, queueStatus.opponentTeamId) : null;

  return (
    <div className="page-enter">
      <PageHeader
        title={`Olá, ${user?.name}!`}
        subtitle={`${dashboard.currentPhase} · Truco do Novo`}
      />

      <AnimatedBorderCard className="player-home-hero-wrap">
        <Card accent="gold" className="player-home-hero">
          <span className="player-home-hero-suits" aria-hidden="true">♠ ♥ ♦ ♣</span>
          <span className="eyebrow">Minha dupla</span>
          <strong className="player-home-team-name">{myTeam ? myTeam.name : "Aguardando confirmação"}</strong>
          <div className="player-home-hero-tags">
            {myTeam?.groupId && <Badge tone="green">Grupo {myTeam.groupId}</Badge>}
            {myTeam?.seeded && <Badge tone="gold">★ Cabeça de chave</Badge>}
            {myPosition && <Badge tone="info">{myPosition}º colocado no grupo</Badge>}
          </div>

          <div className="player-home-hero-divider" />

          <div className="player-home-hero-next">
            <div className="player-home-hero-next-top">
              <span className="eyebrow">Sua fila</span>
              <Badge tone={STATUS_TONE[queueStatus.status]}>{STATUS_LABEL[queueStatus.status]}</Badge>
            </div>
            {queueStatus.status === "finalizado" ? (
              <p className="text-muted">Sua dupla já disputou todos os jogos da fase de grupos.</p>
            ) : opponentName ? (
              <div className="player-home-next-match">
                <strong>Contra {opponentName}</strong>
                <span className="text-muted">
                  {queueStatus.matchesAhead === 0
                    ? "É a sua vez"
                    : queueStatus.matchesAhead !== null
                      ? `${queueStatus.matchesAhead} jogo(s) antes do seu`
                      : "Aguardando definição"}
                </span>
              </div>
            ) : (
              <p className="text-muted">Nenhum jogo pendente no momento.</p>
            )}
          </div>
        </Card>
      </AnimatedBorderCard>

      {dashboard.drawStatus === "pendente" && (
        <Card accent="none" className="player-home-status">
          <span className="eyebrow">Status do campeonato</span>
          <p className="text-muted">As duplas e os grupos estão sendo definidos manualmente pelo administrador.</p>
        </Card>
      )}

      <h2 className="section-title">Explorar</h2>
      <nav className="player-home-actions stagger" aria-label="Atalhos do campeonato">
        {SHORTCUTS.map((shortcut) => (
          <Link key={shortcut.to} to={shortcut.to} className="player-home-shortcut">
            <span className="player-home-shortcut-icon">
              <Icon name={shortcut.icon} size={20} />
            </span>
            <span className="player-home-shortcut-text">
              <strong>{shortcut.label}</strong>
              <span className="text-faint">{shortcut.hint}</span>
            </span>
            <span className="player-home-shortcut-chevron" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
