import type { Group, StandingRow, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { StandingsTable } from "../../components/truco/StandingsTable";
import { useFetchData } from "../../hooks/useFetchData";
import { getTeams } from "../../services/teamsService";
import { getGroups, getStandings } from "../../services/groupsService";
import "./AdminGroupsPage.css";

interface Data {
  teams: Team[];
  groups: Group[];
  standingsA: StandingRow[];
  standingsB: StandingRow[];
}

export function AdminGroupsPage() {
  const { data, isLoading, error } = useFetchData<Data>(async () => {
    const [teams, groups] = await Promise.all([getTeams(), getGroups()]);
    const [standingsA, standingsB] = await Promise.all([getStandings("A"), getStandings("B")]);
    return { teams, groups, standingsA, standingsB };
  });

  if (isLoading) return <Loading fullHeight label="Carregando grupos..." />;
  if (error || !data) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar os grupos" description={error ?? ""} />;

  const hasGroups = data.groups.some((g) => g.teamIds.length > 0);

  if (!hasGroups) {
    return (
      <div>
        <PageHeader title="Grupos" subtitle="Classificação da fase de grupos" />
        <EmptyState icon="🎲" title="Sorteio ainda não realizado" description="Realize o sorteio para formar os Grupos A e B." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Grupos" subtitle="Classificação da fase de grupos" />
      <div className="admin-groups-page">
        <section>
          <h2 className="section-title section-title-gold">Grupo A</h2>
          <StandingsTable rows={data.standingsA} teams={data.teams} />
        </section>
        <section>
          <h2 className="section-title section-title-gold">Grupo B</h2>
          <StandingsTable rows={data.standingsB} teams={data.teams} />
        </section>
      </div>
    </div>
  );
}
