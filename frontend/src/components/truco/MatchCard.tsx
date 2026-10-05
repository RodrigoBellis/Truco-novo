import type { ReactNode } from "react";
import type { Match } from "@truco/shared";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { AnimatedBorderCard } from "../ui/AnimatedBorderCard";
import { formatScore } from "../../utils/format";
import { useValueChangePulse } from "../../hooks/useValueChangePulse";
import "./MatchCard.css";

interface MatchCardProps {
  match: Match;
  teamAName: string;
  teamBName: string;
  teamAStrength?: number;
  teamBStrength?: number;
  highlightTeamId?: string | null;
  actions?: ReactNode;
  /** Marca o confronto como "ao vivo" (sendo registrado agora), destacando com o brilho animado. */
  live?: boolean;
}

export function MatchCard({ match, teamAName, teamBName, teamAStrength = 3, teamBStrength = 3, highlightTeamId, actions, live = false }: MatchCardProps) {
  const teamAWon = match.result && match.result.setsA > match.result.setsB;
  const teamBWon = match.result && match.result.setsB > match.result.setsA;

  // Um jogo acompanhado ao vivo atualiza o placar sozinho, pela realtime.
  // Sem o pulso, o número simplesmente troca e a mudança passa despercebida.
  const score = formatScore(match.result);
  const scoreRef = useValueChangePulse<HTMLDivElement>(score);

  const card = (
    <Card className={`match-card${match.status === "realizado" ? " match-card-done" : ""}`} interactive>
      <div className="match-card-top">
        <Badge tone={match.stage === "grupos" ? "green" : "gold"}>{match.round}</Badge>
        {live ? (
          <Badge tone="danger">
            <span className="match-card-live-dot" /> Ao vivo
          </Badge>
        ) : (
          <Badge tone={match.status === "realizado" ? "info" : "neutral"}>
            {match.status === "realizado" ? "Realizado" : "Pendente"}
          </Badge>
        )}
      </div>

      <div className="match-card-teams">
        <div className={`match-card-team${match.teamAId === highlightTeamId ? " match-card-team-mine" : ""}${teamAWon ? " match-card-team-winner" : ""}`}>
          <span>{teamAName}</span>
          <small className="match-card-strength" aria-label={`Força ${teamAStrength} de 5`}>★ {teamAStrength}/5</small>
        </div>
        <div className="match-card-score" ref={scoreRef}>{score}</div>
        <div className={`match-card-team${match.teamBId === highlightTeamId ? " match-card-team-mine" : ""}${teamBWon ? " match-card-team-winner" : ""}`}>
          <span>{teamBName}</span>
          <small className="match-card-strength" aria-label={`Força ${teamBStrength} de 5`}>★ {teamBStrength}/5</small>
        </div>
      </div>

      {actions && <div className="match-card-actions">{actions}</div>}
    </Card>
  );

  if (!live) return card;

  return <AnimatedBorderCard duration={2.5}>{card}</AnimatedBorderCard>;
}
