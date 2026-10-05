import { useState } from "react";
import type { Group, StandingRow, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { StandingsTable } from "../../components/truco/StandingsTable";
import { useFetchData } from "../../hooks/useFetchData";
import { getTeams } from "../../services/teamsService";
import { generateGroupFixtures, getGroups, getStandings } from "../../services/groupsService";
import { getMatches } from "../../services/matchesService";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../services/api";
import "./AdminGroupsPage.css";

interface Data {
  teams: Team[];
  groups: Group[];
  standingsA: StandingRow[];
  standingsB: StandingRow[];
  matchCount: number;
}

export function AdminGroupsPage() {
  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, groups] = await Promise.all([getTeams(), getGroups()]);
    const [standingsA, standingsB, matches] = await Promise.all([getStandings("A"), getStandings("B"), getMatches({ stage: "grupos" })]);
    return { teams, groups, standingsA, standingsB, matchCount: matches.length };
  });
  const { showToast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      const result = await generateGroupFixtures();
      showToast("success", `${result.matchesCreated} jogos criados com os grupos definidos pelo administrador.`);
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível gerar os jogos.");
    } finally { setIsGenerating(false); }
  }

  if (isLoading) return <Loading fullHeight label="Carregando grupos..." />;
  if (error || !data) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar os grupos" description={error ?? ""} />;

  const hasGroups = data.groups.some((g) => g.teamIds.length > 0);

  if (!hasGroups) {
    return (
      <div>
        <PageHeader title="Grupos" subtitle="Classificação da fase de grupos" />
        <EmptyState icon="♠" title="Grupos ainda não definidos" description="Cadastre as duplas e escolha manualmente o grupo de cada uma na área Duplas." />
      </div>
    );
  }

  return (
    <div className="page-enter">
      <PageHeader title="Grupos" subtitle="Grupos definidos manualmente pelo administrador" actions={
        data.matchCount === 0 && data.groups.every((group) => group.teamIds.length === 5)
          ? <Button isLoading={isGenerating} onClick={() => void handleGenerate()}>Gerar 20 jogos da fase de grupos</Button>
          : undefined
      } />
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
