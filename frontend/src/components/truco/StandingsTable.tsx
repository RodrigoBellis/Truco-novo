import type { StandingRow, Team } from "@truco/shared";
import { teamLabel } from "../../utils/teamHelpers";
import "./StandingsTable.css";

interface StandingsTableProps {
  rows: StandingRow[];
  teams: Team[];
  highlightTeamId?: string | null;
}

function statusFor(position: number): { label: string; tone: "gold" | "green" | "danger" } {
  if (position === 1) return { label: "Semifinal direta", tone: "gold" };
  if (position <= 4) return { label: "Mata-mata", tone: "green" };
  return { label: "Eliminado", tone: "danger" };
}

export function StandingsTable({ rows, teams, highlightTeamId }: StandingsTableProps) {
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
            <th>Pts</th>
            <th className="standings-col-status">Situação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = statusFor(row.position);
            const isMine = row.teamId === highlightTeamId;
            return (
              <tr key={row.teamId} className={`standings-row standings-row-${status.tone}${isMine ? " standings-row-mine" : ""}`}>
                <td className="standings-position">{row.position}º</td>
                <td className="standings-team">
                  {teamLabel(teams, row.teamId)}
                  {isMine && <span className="standings-you">você</span>}
                </td>
                <td className="standings-col-opt">{row.jogos}</td>
                <td>{row.vitorias}</td>
                <td className="standings-col-opt">{row.derrotas}</td>
                <td className="standings-col-opt">{row.saldoSets > 0 ? `+${row.saldoSets}` : row.saldoSets}</td>
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

      {/* Substitui a coluna "Situação", ocultada em telas estreitas */}
      <ul className="standings-legend" aria-hidden="true">
        <li>
          <span className="standings-legend-dot standings-legend-dot-gold" />
          Semifinal direta
        </li>
        <li>
          <span className="standings-legend-dot standings-legend-dot-green" />
          Mata-mata
        </li>
        <li>
          <span className="standings-legend-dot standings-legend-dot-danger" />
          Eliminado
        </li>
      </ul>
    </>
  );
}
