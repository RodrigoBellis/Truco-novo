import type { ReactNode } from "react";
import type { Match, Team } from "@truco/shared";
import { MatchCard } from "./MatchCard";
import { teamLabel } from "../../utils/teamHelpers";
import { groupMatchesByRound } from "../../utils/matchGrouping";
import "./MatchGroupsList.css";

interface MatchGroupsListProps {
  matches: Match[];
  teams: Team[];
  highlightTeamId?: string | null;
  renderActions?: (match: Match) => ReactNode;
  /** Id do confronto sendo registrado agora — recebe o destaque de "ao vivo". */
  liveMatchId?: string | null;
}

export function MatchGroupsList({ matches, teams, highlightTeamId, renderActions, liveMatchId }: MatchGroupsListProps) {
  const groups = groupMatchesByRound(matches);

  return (
    <div className="match-groups">
      {groups.map((group) => (
        <section key={group.round} className="match-group">
          <h3 className="match-group-title">{group.round}</h3>
          <div className="match-group-grid stagger">
            {group.matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                teamAName={teamLabel(teams, match.teamAId)}
                teamBName={teamLabel(teams, match.teamBId)}
                teamAStrength={teams.find((team) => team.id === match.teamAId)?.strength ?? 3}
                teamBStrength={teams.find((team) => team.id === match.teamBId)?.strength ?? 3}
                highlightTeamId={highlightTeamId}
                actions={renderActions?.(match)}
                live={match.id === liveMatchId}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
