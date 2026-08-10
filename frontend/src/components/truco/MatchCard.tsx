import type { ReactNode } from "react";
import type { Match } from "@truco/shared";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { AnimatedBorderCard } from "../ui/AnimatedBorderCard";
import { formatScore } from "../../utils/format";
import "./MatchCard.css";

interface MatchCardProps {
  match: Match;
  teamAName: string;
  teamBName: string;
  highlightTeamId?: string | null;
  actions?: ReactNode;
  /** Marca o confronto como "ao vivo" (sendo registrado agora), destacando com o brilho animado. */
  live?: boolean;
}

export function MatchCard({ match, teamAName, teamBName, highlightTeamId, actions, live = false }: MatchCardProps) {
  const teamAWon = match.result && match.result.setsA > match.result.setsB;
  const teamBWon = match.result && match.result.setsB > match.result.setsA;

  const card = (
    <Card className="match-card">
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
        </div>
        <div className="match-card-score">{formatScore(match.result)}</div>
        <div className={`match-card-team${match.teamBId === highlightTeamId ? " match-card-team-mine" : ""}${teamBWon ? " match-card-team-winner" : ""}`}>
          <span>{teamBName}</span>
        </div>
      </div>

      {actions && <div className="match-card-actions">{actions}</div>}
    </Card>
  );

  if (!live) return card;

  return <AnimatedBorderCard duration={2.5}>{card}</AnimatedBorderCard>;
}
