import { Link } from "react-router-dom";
import { pointsForResult, type Match, type MatchResult, type Team } from "@truco/shared";
import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";
import { teamLabel } from "../../utils/teamHelpers";
import "./TeamRecentResults.css";

const RECENT_LIMIT = 3;

type Outcome = "win" | "loss" | "draw";

const OUTCOME_BADGE: Record<Outcome, { label: string; tone: "green" | "danger" | "neutral" }> = {
  win: { label: "Vitória", tone: "green" },
  loss: { label: "Derrota", tone: "danger" },
  draw: { label: "Empate", tone: "neutral" },
};

type FinishedMatch = Match & { result: MatchResult };

/**
 * Jogos encerrados da dupla, do mais recente para o mais antigo. Não há data de encerramento:
 * vale a posição na fila (maior = mais recente), com a ordem original como desempate. O mata-mata
 * não tem fila e acontece depois dos grupos, por isso vem na frente.
 */
function recentFinished(matches: Match[], teamId: string): FinishedMatch[] {
  const stageRank = (match: Match) => (match.stage === "mata-mata" ? 1 : 0);
  return matches
    .filter((match): match is FinishedMatch => match.status === "realizado" && match.result != null && (match.teamAId === teamId || match.teamBId === teamId))
    .sort((a, b) => stageRank(b) - stageRank(a) || (b.queuePosition ?? -1) - (a.queuePosition ?? -1) || b.order - a.order)
    .slice(0, RECENT_LIMIT);
}

interface TeamRecentResultsProps {
  teamId: string;
  teams: Team[];
  /** Partidas da dupla; `null` quando a busca falhou (o resto da página segue funcionando). */
  matches: Match[] | null;
}

/** Histórico de Minha Dupla: os três jogos encerrados mais recentes. A lista completa mora em Jogos. */
export function TeamRecentResults({ teamId, teams, matches }: TeamRecentResultsProps) {
  const recent = matches ? recentFinished(matches, teamId) : [];
  return (
    <section className="team-results" aria-labelledby="team-results-title">
      <header className="team-results-head">
        <h2 id="team-results-title">Histórico da dupla</h2>
        {recent.length > 0 && <span>{recent.length === 1 ? "Último jogo encerrado" : `Últimos ${recent.length} jogos encerrados`}</span>}
      </header>

      {recent.length > 0 ? (
        <ol className="team-results-list">
          {recent.map((match) => {
            const isTeamA = match.teamAId === teamId;
            const mine = isTeamA ? match.result.setsA : match.result.setsB;
            const theirs = isTeamA ? match.result.setsB : match.result.setsA;
            const outcome: Outcome = mine > theirs ? "win" : mine < theirs ? "loss" : "draw";
            // Mata-mata não soma pontos na classificação: a linha mostra a fase no lugar deles.
            const points = match.stage === "grupos" ? pointsForResult(match.result, isTeamA) : null;
            return (
              <li key={match.id} className={`team-results-row team-results-row-${outcome}`}>
                <p className="team-results-opponent"><span>contra</span> <strong>{teamLabel(teams, isTeamA ? match.teamBId : match.teamAId)}</strong></p>
                <strong className="team-results-score">{mine} × {theirs}</strong>
                <span className="team-results-outcome"><Badge tone={OUTCOME_BADGE[outcome].tone}>{OUTCOME_BADGE[outcome].label}</Badge></span>
                <span className="team-results-points">{points == null ? "Mata-mata" : `+${points} ${points === 1 ? "pt" : "pts"}`}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="team-results-empty">
          <span className="team-results-empty-icon" aria-hidden="true"><Icon name="spade" size={20} /></span>
          <div>
            <strong>{matches ? "A campanha ainda não começou" : "Histórico indisponível no momento"}</strong>
            <p>{matches ? "Os resultados da dupla aparecem aqui assim que o primeiro jogo for encerrado." : "Não foi possível buscar os jogos da dupla agora. Tente de novo em instantes."}</p>
          </div>
        </div>
      )}

      <Link className="team-results-link" to="/jogos"><span>Ver todos os jogos</span><Icon name="arrow" size={18} /></Link>
    </section>
  );
}
