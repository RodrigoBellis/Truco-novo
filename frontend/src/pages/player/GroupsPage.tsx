import { useEffect, useState } from "react";
import type { GroupId, Player, StandingRow, Team } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { StandingsTable } from "../../components/truco/StandingsTable";
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { useRealtimeMatches } from "../../hooks/useRealtimeMatches";
import { getTeams } from "../../services/teamsService";
import { getPlayers } from "../../services/playersService";
import { getStandings } from "../../services/groupsService";
import "./GroupsPage.css";

interface Data {
  teams: Team[];
  players: Player[];
  myGroupId: GroupId | null;
  standings: Record<GroupId, StandingRow[]>;
}

export function GroupsPage() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, players] = await Promise.all([getTeams(), getPlayers()]);
    const myGroupId = teams.find((team) => team.id === user?.teamId)?.groupId ?? null;
    const [a, b] = await Promise.all([getStandings("A"), getStandings("B")]);
    return { teams, players, myGroupId, standings: { A: a, B: b } };
  }, [user?.teamId]);
  const [selectedGroup, setSelectedGroup] = useState<GroupId | null>(null);

  useEffect(() => {
    if (data) setSelectedGroup((current) => current ?? data.myGroupId ?? "A");
  }, [data]);
  useRealtimeMatches(refetch);

  if (isLoading) return <Loading fullHeight label="Carregando grupos..." />;
  if (error) return <EmptyState icon={<Icon name="group" size={36} />} tone="danger" title="Não foi possível carregar os grupos" description={error} />;

  const activeGroup = selectedGroup ?? data?.myGroupId ?? "A";
  if (!data?.standings[activeGroup].length) {
    return <div className="page-enter"><PageHeader title="Grupos" subtitle="Classificação dos Grupos A e B · 5ª Edição 2026" /><GroupTabs selected={activeGroup} myGroup={data?.myGroupId ?? null} onSelect={setSelectedGroup} /><EmptyState icon={<Icon name="group" size={36} />} title="Grupos ainda não definidos" description="As classificações aparecerão aqui assim que as duplas forem organizadas pelo administrador." /></div>;
  }

  return (
    <div className="page-enter">
      <PageHeader title="Grupos" subtitle="Acompanhe a classificação completa dos dois grupos" />
      <GroupTabs selected={activeGroup} myGroup={data.myGroupId} onSelect={setSelectedGroup} />
      <section key={activeGroup} className="groups-standings groups-standings-enter" aria-labelledby="groups-standings-title">
        <div className="groups-standings-heading"><div><h2 id="groups-standings-title">Grupo {activeGroup}</h2><p>{data.standings[activeGroup].length} duplas na disputa · classificação atualizada pelos resultados</p></div>{activeGroup === data.myGroupId ? <span className="groups-own-badge">Seu grupo</span> : <span className="groups-other-note">{data.myGroupId ? `Sua dupla está no Grupo ${data.myGroupId}` : "Sua dupla ainda não tem grupo"}</span>}</div>
        <StandingsTable rows={data.standings[activeGroup]} teams={data.teams} players={data.players} highlightTeamId={user?.teamId} />
      </section>
    </div>
  );
}

function GroupTabs({ selected, myGroup, onSelect }: { selected: GroupId; myGroup: GroupId | null; onSelect: (group: GroupId) => void }) {
  return <div className="groups-tabs" role="tablist" aria-label="Escolher grupo">
    {(["A", "B"] as const).map((group) => <button key={group} type="button" role="tab" aria-selected={selected === group} tabIndex={selected === group ? 0 : -1} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); onSelect(group === "A" ? "B" : "A"); (event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[group === "A" ? 1 : 0])?.focus(); } }} className={`groups-tab${selected === group ? " groups-tab-active" : ""}`} onClick={() => onSelect(group)}>
      Grupo {group}{myGroup === group && <span> · Seu grupo</span>}
    </button>)}
  </div>;
}
