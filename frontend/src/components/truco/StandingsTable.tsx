import { qualificationForPosition, type StandingRow, type Team } from "@truco/shared";
import { teamLabel } from "../../utils/teamHelpers";
import { useFlipReorder } from "../../hooks/useFlipReorder";
import "./StandingsTable.css";

interface StandingsTableProps {
  rows: StandingRow[];
  teams: Team[];
  highlightTeamId?: string | null;
}

export function StandingsTable({ rows, teams, highlightTeamId }: StandingsTableProps) {
  // Quando um resultado é registrado e a tabela reordena, as duplas deslizam
  // até a nova posição em vez de trocarem de lugar num piscar.
  const registerRow = useFlipReorder(rows.map((row) => row.teamId));

  return (
    <>
      <div className="standings-table-wrap">
      <table className="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Dupla</th>
            <th className="standings-col-opt">J</th>
            <th>V</th>
            <th className="standings-col-opt">D</th>
            <th className="standings-col-opt">Saldo</th>
            <th className="standings-col-stars">Força</th>
            <th>Pts</th>
            <th className="standings-col-status">Situação</th>
          </tr>
        </thead>
        <tbody className="stagger">
          {rows.map((row) => {
            const tone = qualificationForPosition(row.position);
            const status = { label: tone === "semifinal" ? "Semifinal" : tone === "repescagem" ? "Repescagem" : "Eliminado", tone };
            const isMine = row.teamId === highlightTeamId;
            const team = teams.find((candidate) => candidate.id === row.teamId);
            return (
              <tr
                key={row.teamId}
                ref={registerRow(row.teamId)}
                className={`standings-row standings-row-${status.tone}${isMine ? " standings-row-mine" : ""}`}
              >
                <td className="standings-position">
                  {`${row.position}º`}
                </td>
                <td className="standings-team">
                  {teamLabel(teams, row.teamId)}
                  <span className="standings-stars-mobile" aria-label={`Força ${team?.strength ?? 3} de 5`}>{"★".repeat(team?.strength ?? 3)}<span>{"★".repeat(5 - (team?.strength ?? 3))}</span></span>
                  {isMine && <span className="standings-you">você</span>}
                </td>
                <td className="standings-col-opt">{row.jogos}</td>
                <td>{row.vitorias}</td>
                <td className="standings-col-opt">{row.derrotas}</td>
                <td className="standings-col-opt">{row.saldoSets > 0 ? `+${row.saldoSets}` : row.saldoSets}</td>
                <td className="standings-col-stars" aria-label={`Força ${team?.strength ?? 3} de 5`}>
                  <span className="standings-stars" aria-hidden="true">{"★".repeat(team?.strength ?? 3)}<span>{"★".repeat(5 - (team?.strength ?? 3))}</span></span>
                </td>
                <td className="standings-points">{row.pontos}</td>
                <td className="standings-col-status">
                  <span className={`standings-tag standings-tag-${status.tone}`}>{status.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* A legenda mantém as zonas identificáveis em telas estreitas. */}
      <ul className="standings-legend" aria-label="Legenda da classificação">
        <li><span className="standings-legend-dot standings-legend-dot-semifinal" />Semifinal</li>
        <li><span className="standings-legend-dot standings-legend-dot-repescagem" />Repescagem</li>
        <li><span className="standings-legend-dot standings-legend-dot-eliminado" />Eliminado</li>
      </ul>
    </>
  );
}
