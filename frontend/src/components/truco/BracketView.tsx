import type { BracketMatch, BracketRound, BracketSlotSource, Match, Team } from "@truco/shared";
import { teamLabel } from "../../utils/teamHelpers";
import { formatScore } from "../../utils/format";
import "./BracketView.css";

interface BracketViewProps {
  bracketMatches: BracketMatch[];
  matches: Match[];
  teams: Team[];
}

const ROUND_ORDER: BracketRound[] = ["oitavas", "quartas", "semifinal", "final"];
const ROUND_LABELS: Record<BracketRound, string> = {
  oitavas: "Oitavas",
  quartas: "Quartas de Final",
  semifinal: "Semifinal",
  final: "Final",
};

export function BracketView({ bracketMatches, matches, teams }: BracketViewProps) {
  function resolveName(slot: BracketSlotSource): string {
    if (slot.type === "direct") return teamLabel(teams, slot.teamId);
    if (slot.type === "tbd") return "A definir";

    const source = bracketMatches.find((b) => b.id === slot.bracketMatchId);
    if (!source?.matchId) return "A definir";
    const match = matches.find((m) => m.id === source.matchId);
    if (!match?.result) return "A definir";
    const winnerId = match.result.setsA > match.result.setsB ? match.teamAId : match.teamBId;
    return teamLabel(teams, winnerId);
  }

  return (
    <div className="bracket-view">
      {ROUND_ORDER.map((round) => {
        const roundMatches = bracketMatches.filter((b) => b.round === round).sort((a, b) => a.order - b.order);
        if (roundMatches.length === 0) return null;

        return (
          <div key={round} className="bracket-column">
            <h3 className="bracket-column-title">{ROUND_LABELS[round]}</h3>
            <div className="bracket-column-matches">
              {roundMatches.map((bracketMatch) => {
                const match = bracketMatch.matchId ? matches.find((m) => m.id === bracketMatch.matchId) : undefined;
                const nameA = resolveName(bracketMatch.slotA);
                const nameB = resolveName(bracketMatch.slotB);
                const aWon = match?.result && match.result.setsA > match.result.setsB;
                const bWon = match?.result && match.result.setsB > match.result.setsA;

                return (
                  <div key={bracketMatch.id} className="bracket-match">
                    <div className={`bracket-slot${aWon ? " bracket-slot-winner" : ""}`}>{nameA}</div>
                    <div className={`bracket-slot${bWon ? " bracket-slot-winner" : ""}`}>{nameB}</div>
                    <div className="bracket-score">{match ? formatScore(match.result) : "—"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
