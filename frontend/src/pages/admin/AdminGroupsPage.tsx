import { useState } from "react";
import { EDITION_GROUP_IDS, groupDisplayName, MATCHES_PER_GROUP, TEAMS_PER_GROUP, pendingTieClusters, type Group, type GroupId, type Match, type StandingRow, type Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { StandingsTable } from "../../components/truco/StandingsTable";
import { useFetchData } from "../../hooks/useFetchData";
import { getTeams } from "../../services/teamsService";
import { completeGroupFixtures, generateGroupFixtures, getGroups, getStandings, resolveGroupTie } from "../../services/groupsService";
import { TieDecision } from "../../components/truco/TieDecision";
import { getMatches } from "../../services/matchesService";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../services/api";
import "./AdminGroupsPage.css";

interface Data {
  teams: Team[];
  groups: Group[];
  standingsA: StandingRow[];
  matches: Match[];
}

/** Confrontos que ainda faltam quando o grupo já está completo. */
function missingMatchCount(groups: Group[], matches: Match[]): number {
  if (!EDITION_GROUP_IDS.every((groupId) => groups.find((group) => group.id === groupId)?.teamIds.length === TEAMS_PER_GROUP)) return 0;
  return EDITION_GROUP_IDS.reduce((total, groupId) => total + Math.max(0, MATCHES_PER_GROUP - matches.filter((match) => match.groupId === groupId).length), 0);
}

export function AdminGroupsPage() {
  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, groups] = await Promise.all([getTeams(), getGroups()]);
    const [standingsA, matches] = await Promise.all([getStandings("A"), getMatches({ stage: "grupos" })]);
    return { teams, groups, standingsA, matches };
  });
  const { showToast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [savingTie, setSavingTie] = useState<GroupId | null>(null);

  async function handleTie(groupId: GroupId, orderedTeamIds: string[]) {
    setSavingTie(groupId);
    try {
      await resolveGroupTie(groupId, orderedTeamIds);
      showToast("success", "Posições confirmadas. O empate do " + groupDisplayName(groupId) + " está decidido.");
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível registrar a decisão do empate.");
    } finally { setSavingTie(null); }
  }

  async function handleGenerate(mode: "all" | "missing") {
    setIsGenerating(true);
    try {
      const result = mode === "all" ? await generateGroupFixtures() : await completeGroupFixtures();
      showToast("success", mode === "all"
        ? `${result.matchesCreated} jogos criados com os grupos definidos pelo administrador.`
        : `${result.matchesCreated} jogos criados para as duplas novas. Placar e ordem dos jogos já disputados não mudaram.`);
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível gerar os jogos.");
    } finally { setIsGenerating(false); }
  }

  if (isLoading) return <Loading fullHeight label="Carregando grupos..." />;
  if (error || !data) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar os grupos" description={error ?? ""} />;

  const hasGroups = data.groups.some((g) => g.teamIds.length > 0);
  const groupsComplete = EDITION_GROUP_IDS.every((groupId) => data.groups.find((group) => group.id === groupId)?.teamIds.length === TEAMS_PER_GROUP);
  const missingMatches = missingMatchCount(data.groups, data.matches);

  if (!hasGroups) {
    return (
      <div>
        <PageHeader title="Grupos" subtitle="Classificação da fase de grupos" />
        <EmptyState icon="♠" title="Grupos ainda não definidos" description="Cadastre as 7 duplas na área Duplas: todas ficam no grupo único." />
      </div>
    );
  }

  return (
    <div className="page-enter">
      <PageHeader title="Grupos" subtitle="Grupo único: 7 duplas, todos contra todos (21 jogos)" actions={
        data.matches.length === 0 && groupsComplete
          ? <Button isLoading={isGenerating} onClick={() => void handleGenerate("all")}>Gerar {MATCHES_PER_GROUP * EDITION_GROUP_IDS.length} jogos da fase de grupos</Button>
          : data.matches.length > 0 && missingMatches > 0
            ? <Button isLoading={isGenerating} onClick={() => void handleGenerate("missing")}>Gerar {missingMatches} jogos das duplas novas</Button>
            : undefined
      } />
      <div className="admin-groups-page">
        <section>
          <h2 className="section-title section-title-gold">{groupDisplayName("A")}</h2>
          <StandingsTable rows={data.standingsA} teams={data.teams} />
          {pendingTieClusters(data.standingsA).map((cluster) => <TieDecision key={cluster.map((row) => row.teamId).join("-")} groupId="A" cluster={cluster} teams={data.teams} isSaving={savingTie === "A"} onConfirm={(order) => void handleTie("A", order)} />)}
        </section>
      </div>
    </div>
  );
}
