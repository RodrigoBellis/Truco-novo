import type { ReactNode } from "react";
import type { Match, Player, Team } from "@truco/shared";
import { MatchCard } from "./MatchCard";
import { teamLabel } from "../../utils/teamHelpers";
import { teamHue } from "../../utils/teamColor";
import { groupToneClass } from "../../utils/groupColor";
import { groupMatchesByRound } from "../../utils/matchGrouping";
import "./MatchGroupsList.css";

interface MatchGroupsListProps {
  matches: Match[];
  teams: Team[];
  players?: Player[];
  highlightTeamId?: string | null;
  renderActions?: (match: Match) => ReactNode;
  /** Id do confronto com o formulário de resultado aberto. */
  liveMatchId?: string | null;
  /** Seções prontas (ex.: "Próximos jogos" / "Já jogados"); sem elas, agrupa por rodada. */
  sections?: Array<{ title: string; matches: Match[] }>;
}

export function MatchGroupsList({ matches, teams, players = [], highlightTeamId, renderActions, liveMatchId, sections }: MatchGroupsListProps) {
  const groups = sections
    ? sections.filter((section) => section.matches.length > 0).map((section) => ({ round: section.title, matches: section.matches }))
    : groupMatchesByRound(matches);
  const teamById = new Map(teams.map((team) => [team.id, team]));

  return (
    <div className="match-groups">
      {groups.map((group) => {
        // Seção de um único grupo ganha a cor dele; rodadas mistas (mata-mata) e seções prontas ficam neutras.
        const groupId = !sections && group.matches.every((match) => match.groupId === group.matches[0].groupId) ? group.matches[0].groupId : null;
        return (
          <section key={group.round} className={`match-group ${groupToneClass(groupId)}`.trim()}>
            <h3 className="match-group-title">
              {group.round}
              <span className="match-group-count">{group.matches.length}</span>
            </h3>
            <div className="match-group-grid stagger">
              {group.matches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  teamAName={teamLabel(teams, match.teamAId)}
                  teamBName={teamLabel(teams, match.teamBId)}
                  teamAStrength={teamById.get(match.teamAId ?? "")?.strength}
                  teamBStrength={teamById.get(match.teamBId ?? "")?.strength}
                  teamAHue={teamHue(match.teamAId, teams)}
                  teamBHue={teamHue(match.teamBId, teams)}
                  teamAPlayers={players.filter((player) => [teamById.get(match.teamAId)?.player1Id, teamById.get(match.teamAId)?.player2Id].includes(player.id))}
                  teamBPlayers={players.filter((player) => [teamById.get(match.teamBId)?.player1Id, teamById.get(match.teamBId)?.player2Id].includes(player.id))}
                  highlightTeamId={highlightTeamId}
                  actions={renderActions?.(match)}
                  live={match.id === liveMatchId}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
