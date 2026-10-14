import { QUALIFICATION_ZONES, QUALIFICATION_ZONE_LABEL, STANDINGS_CRITERIA, TEAMS_PER_GROUP, qualificationForPosition, type Player, type StandingRow, type Team } from "@truco/shared";
import { teamLabel } from "../../utils/teamHelpers";
import { teamHue } from "../../utils/teamColor";
import { TeamCrest } from "./TeamCrest";
import { useFlipReorder } from "../../hooks/useFlipReorder";
import { TeamStrength } from "./TeamStrength";
import "./StandingsTable.css";

interface StandingsTableProps {
  rows: StandingRow[];
  teams: Team[];
  players?: Player[];
  highlightTeamId?: string | null;
}

/** Cor de cada zona, dita em palavras na legenda para não depender só da cor. */
const ZONE_COLOR_NAME = { semifinal: "Verde", quartas: "Azul", eliminado: "Vermelho" } as const;

export function StandingsTable({ rows, teams, players = [], highlightTeamId }: StandingsTableProps) {
  // Quando um resultado é registrado e a tabela reordena, as duplas deslizam
  // até a nova posição em vez de trocarem de lugar num piscar.
  const registerRow = useFlipReorder(rows.map((row) => row.teamId));
  const hasPendingTie = rows.some((row) => row.tiePending);

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
            <th className="standings-col-opt" title="Vitórias por 2x0">2x0</th>
            <th className="standings-col-opt">D</th>
            <th className="standings-col-opt" title="Saldo de quedas">Saldo</th>
            <th className="standings-col-stars">Força</th>
            <th>Pts</th>
            <th className="standings-col-status">Situação</th>
          </tr>
        </thead>
        <tbody className="stagger">
          {rows.map((row) => {
            // Grupo com mais linhas que o formato (dado inesperado) não pode derrubar a tela.
            const tone = qualificationForPosition(row.position, Math.max(rows.length, TEAMS_PER_GROUP));
            const status = { label: QUALIFICATION_ZONE_LABEL[tone], tone };
            const isMine = row.teamId === highlightTeamId;
            const team = teams.find((candidate) => candidate.id === row.teamId);
            const label = teamLabel(teams, row.teamId);
            const playerNames = team ? [team.player1Id, team.player2Id].map((id) => players.find((player) => player.id === id)?.name).filter(Boolean) : [];
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
                  <span className="standings-team-name"><TeamCrest name={label} hue={teamHue(row.teamId, teams)} size="dot" />{label}</span>
                  {playerNames.length > 0 && playerNames.join(" & ") !== label && <small className="standings-players">{playerNames.join(" & ")}</small>}
                  <span className="standings-stars-mobile"><TeamStrength value={team?.strength} compact /></span>
                  {isMine && <span className="standings-you">Sua dupla</span>}
                  {row.tiePending && <span className="standings-tie">Empate a decidir</span>}
                  <small className="standings-mobile-stats">J {row.jogos} · V {row.vitorias} ({row.vitorias2x0} por 2x0) · D {row.derrotas} · Saldo {row.saldoSets > 0 ? `+${row.saldoSets}` : row.saldoSets}</small>
                  <span className={`standings-mobile-status standings-tag standings-tag-${status.tone}`}>{status.label}</span>
                </td>
                <td className="standings-col-opt">{row.jogos}</td>
                <td>{row.vitorias}</td>
                <td className="standings-col-opt">{row.vitorias2x0}</td>
                <td className="standings-col-opt">{row.derrotas}</td>
                <td className="standings-col-opt">{row.saldoSets > 0 ? `+${row.saldoSets}` : row.saldoSets}</td>
                <td className="standings-col-stars">
                  <TeamStrength value={team?.strength} compact />
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

      {hasPendingTie && (
        <p className="standings-tie-note" role="status">
          Há duplas empatadas em todos os critérios ({STANDINGS_CRITERIA.join(", ")}). As posições marcadas dependem da decisão do administrador.
        </p>
      )}

      {/* A legenda mantém as zonas identificáveis em telas estreitas. */}
      <ul className="standings-legend" aria-label="Legenda da classificação">
        {QUALIFICATION_ZONES.map((zone) => (
          <li key={zone}><span className={`standings-legend-dot standings-legend-dot-${zone}`} />{ZONE_COLOR_NAME[zone]} = {QUALIFICATION_ZONE_LABEL[zone]}</li>
        ))}
        <li className="standings-legend-rule">Ordem da classificação: {STANDINGS_CRITERIA.join(", ")}</li>
      </ul>
    </>
  );
}
