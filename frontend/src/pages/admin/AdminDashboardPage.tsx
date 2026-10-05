import { Link } from "react-router-dom";
import type { Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatCard } from "../../components/ui/StatCard";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { AnimatedBorderCard } from "../../components/ui/AnimatedBorderCard";
import { Disclosure } from "../../components/ui/Disclosure";
import { useFetchData } from "../../hooks/useFetchData";
import { getDashboardStats } from "../../services/dashboardService";
import { getTeams } from "../../services/teamsService";
import { teamLabel } from "../../utils/teamHelpers";
import "./AdminDashboardPage.css";

export function AdminDashboardPage() {
  const { data: stats, isLoading: statsLoading, error: statsError } = useFetchData(getDashboardStats);
  const { data: teams } = useFetchData<Team[]>(getTeams);

  if (statsLoading) return <Loading fullHeight label="Carregando dashboard..." />;
  if (statsError || !stats) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar o dashboard" description={statsError ?? ""} />;

  const needsAttention = stats.pendingApprovals > 0 || stats.drawStatus === "pendente";

  return (
    <div className="page-enter">
      <PageHeader title="Dashboard" subtitle="Visão geral do Truco do Novo" />

      {stats.champion && (
        <AnimatedBorderCard duration={4.5} className="admin-dashboard-champion-wrap">
          <Card accent="gold" className="admin-dashboard-champion">
            <span className="admin-dashboard-champion-icon">
              <Icon name="trophy" size={26} />
            </span>
            <div>
              <span className="text-faint">Campeão do Torneio</span>
              <strong className="admin-dashboard-champion-name">{stats.champion.teamName}</strong>
            </div>
          </Card>
        </AnimatedBorderCard>
      )}

      {/* Conteúdo primário: só o que exige uma decisão/ação do admin agora. */}
      {needsAttention && (
        <div className="admin-dashboard-attention stagger">
          {stats.pendingApprovals > 0 && (
            <Link to="/admin/aprovacoes" className="admin-dashboard-attention-card admin-dashboard-attention-danger">
              <Icon name="approvals" size={22} />
              <div>
                <strong>{stats.pendingApprovals} inscrição(ões) pendente(s)</strong>
                <span className="text-muted">Aprovar ou recusar duplas aguardando</span>
              </div>
              <span className="admin-dashboard-attention-chevron" aria-hidden="true">›</span>
            </Link>
          )}
          {stats.drawStatus === "pendente" && (
            <Link to="/admin/duplas" className="admin-dashboard-attention-card">
              <Icon name="draw" size={22} />
              <div>
                <strong>Duplas e grupos ainda pendentes</strong>
                <span className="text-muted">Defina manualmente as participações da edição</span>
              </div>
              <span className="admin-dashboard-attention-chevron" aria-hidden="true">›</span>
            </Link>
          )}
        </div>
      )}

      <Card className="admin-dashboard-next">
        <h3>Próximos confrontos</h3>
        {stats.nextMatches.length === 0 ? (
          <EmptyState icon="🎴" title="Nenhum jogo pendente" description="Todos os confrontos foram concluídos ou o sorteio ainda não ocorreu." />
        ) : (
          <ul className="admin-dashboard-next-list">
            {stats.nextMatches.map((match) => (
              <li key={match.id}>
                <Badge tone={match.stage === "grupos" ? "green" : "gold"}>{match.round}</Badge>
                <span>
                  {teamLabel(teams ?? [], match.teamAId)} <span className="text-faint">x</span> {teamLabel(teams ?? [], match.teamBId)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Conteúdo secundário: números de acompanhamento, não decisões. Escondido por padrão. */}
      <Disclosure label="Estatísticas gerais" icon={<Icon name="results" size={18} />} defaultOpen={!needsAttention}>
        <div className="admin-dashboard-stats stagger">
          <StatCard label="Jogadores" value={stats.totalPlayers} icon={<Icon name="players" />} />
          <StatCard label="Duplas" value={stats.totalTeams} icon={<Icon name="team" />} tone="green" />
          <StatCard label="Inscrições pendentes" value={stats.pendingApprovals} icon={<Icon name="approvals" />} tone={stats.pendingApprovals > 0 ? "danger" : "neutral"} />
          <StatCard label="Duplas aprovadas" value={stats.approvedTeams} icon={<Icon name="check" />} tone="gold" />
          <StatCard
            label="Status do sorteio"
            value={stats.drawStatus === "realizado" ? "Realizado" : "Pendente"}
            icon={<Icon name="draw" />}
            tone={stats.drawStatus === "realizado" ? "green" : "danger"}
          />
          <StatCard label="Jogos realizados" value={stats.matchesPlayed} icon={<Icon name="results" />} tone="green" />
          <StatCard label="Jogos pendentes" value={stats.matchesPending} icon={<Icon name="matches" />} />
          <StatCard label="Fase atual" value={stats.currentPhase} icon={<Icon name="bracket" />} tone="gold" />
        </div>
      </Disclosure>
    </div>
  );
}
