export type BracketRound = "oitavas" | "quartas" | "semifinal" | "final";

export type BracketSlotSource =
  | { type: "direct"; teamId: string }
  | { type: "winner"; bracketMatchId: string }
  | { type: "tbd" };

export interface BracketMatch {
  id: string;
  round: BracketRound;
  label: string;
  order: number;
  slotA: BracketSlotSource;
  slotB: BracketSlotSource;
  matchId: string | null;
}
