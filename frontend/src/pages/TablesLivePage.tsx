import type { Team } from "@truco/shared";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Loading } from "../components/ui/Loading";
import { EmptyState } from "../components/ui/EmptyState";
import { useFetchData } from "../hooks/useFetchData";
import { useRealtimeMatches } from "../hooks/useRealtimeMatches";
import { getTeams } from "../services/teamsService";
import { getMatchQueue } from "../services/scheduleService";
import { teamLabel } from "../utils/teamHelpers";
import "./TablesLivePage.css";

interface Data {
  teams: Team[];
  queue: Awaited<ReturnType<typeof getMatchQueue>>;
}

export function TablesLivePage() {
  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, queue] = await Promise.all([getTeams(), getMatchQueue()]);
    return { teams, queue };
  });

  useRealtimeMatches(refetch);

  if (isLoading) return <Loading fullHeight label="Carregando a ordem dos jogos..." />;
  if (error || !data) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar a ordem dos jogos" description={error ?? ""} />;

  const items = data.queue.items;

  return (
    <div>
      <PageHeader title="Ordem dos Jogos" subtitle="A fila de confrontos, na ordem em que serão disputados" />

      {items.length === 0 ? (
        <EmptyState
          icon="🎲"
          title="Escala ainda não gerada"
          description="O administrador ainda não organizou a ordem dos jogos."
        />
      ) : (
        <ul className="queue-list stagger">
          {items.map((item) => (
            <li key={item.matchId}>
              <Card className={`queue-item${item.order === 1 ? " queue-item-next" : ""}`}>
                <span className="queue-item-order">Jogo {item.order}</span>
                <Badge tone={item.groupId === "A" ? "green" : "info"}>Grupo {item.groupId}</Badge>
                <span className="queue-item-teams">
                  {teamLabel(data.teams, item.teamAId)} <span className="text-faint">x</span> {teamLabel(data.teams, item.teamBId)}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
