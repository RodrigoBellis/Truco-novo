import { useState } from "react";
import type { Match, Team } from "@truco/shared";
import { TEAMS_PER_GROUP } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { useFetchData } from "../../hooks/useFetchData";
import { useToast } from "../../hooks/useToast";
import { getTeams } from "../../services/teamsService";
import { getMatches } from "../../services/matchesService";
import { generateSchedule, updateMatchSchedule } from "../../services/scheduleService";
import { teamLabel } from "../../utils/teamHelpers";
import { ApiError } from "../../services/api";
import "../../components/ui/Table.css";
import "./AdminSchedulePage.css";

interface Data {
  teams: Team[];
  matches: Match[];
}

export function AdminSchedulePage() {
  const { data, isLoading, error, refetch } = useFetchData<Data>(async () => {
    const [teams, matches] = await Promise.all([getTeams(), getMatches({ stage: "grupos" })]);
    return { teams, matches };
  });
  const { showToast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      const result = await generateSchedule();
      showToast("success", `Escala gerada: ${result.assignmentsCount} jogos organizados nas mesas.`);
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível gerar a escala.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleChange(matchId: string, patch: { tableNumber?: number | null; queuePosition?: number | null }) {
    setSavingId(matchId);
    try {
      await updateMatchSchedule(matchId, patch);
      showToast("success", "Escala atualizada.");
      refetch();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível ajustar a escala.");
    } finally {
      setSavingId(null);
    }
  }

  if (isLoading) return <Loading fullHeight label="Carregando a escala..." />;
  if (error || !data) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar a escala" description={error ?? ""} />;

  const pending = data.matches.filter((m) => m.status === "pendente").sort((a, b) => (a.queuePosition ?? 9999) - (b.queuePosition ?? 9999));

  return (
    <div className="page-enter">
      <PageHeader
        title="Escala de Mesas"
        subtitle="Organize automaticamente a ordem dos jogos nas 3 mesas, ou ajuste manualmente"
        actions={
          <Button isLoading={isGenerating} onClick={handleGenerate}>
            Gerar escala automática
          </Button>
        }
      />

      {pending.length === 0 ? (
        <EmptyState icon="🎴" title="Nenhum jogo pendente" description={`Os jogos aparecem depois que o administrador definir ${TEAMS_PER_GROUP} duplas em cada grupo e gerar os confrontos.`} />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table admin-schedule-table">
            <thead>
              <tr>
                <th>Ordem</th>
                <th>Grupo</th>
                <th>Confronto</th>
                <th>Mesa</th>
                <th>Bloco</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((match) => (
                <tr key={match.id} className={savingId === match.id ? "admin-schedule-row-saving" : ""}>
                  <td>
                    <input
                      type="number"
                      className="admin-schedule-input"
                      defaultValue={match.queuePosition ?? ""}
                      onBlur={(event) => {
                        const value = event.target.value ? Number(event.target.value) : null;
                        if (value !== match.queuePosition) handleChange(match.id, { queuePosition: value });
                      }}
                    />
                  </td>
                  <td>{match.groupId ?? "—"}</td>
                  <td>
                    {teamLabel(data.teams, match.teamAId)} <span className="text-faint">x</span> {teamLabel(data.teams, match.teamBId)}
                  </td>
                  <td>
                    <select
                      className="admin-schedule-input"
                      value={match.tableNumber ?? ""}
                      onChange={(event) => {
                        const value = event.target.value ? Number(event.target.value) : null;
                        handleChange(match.id, { tableNumber: value });
                      }}
                    >
                      <option value="">—</option>
                      <option value={1}>Mesa 1</option>
                      <option value={2}>Mesa 2</option>
                      <option value={3}>Mesa 3</option>
                    </select>
                  </td>
                  <td className="text-faint">{match.blockNumber ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
