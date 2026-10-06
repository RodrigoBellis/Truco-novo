import type { ReactNode } from "react";
import { pointsForResult, type Match, type Player } from "@truco/shared";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { PlayerAvatar } from "../ui/PlayerAvatar";
import { TeamCrest } from "./TeamCrest";
import { TeamStrength } from "./TeamStrength";
import { formatScore } from "../../utils/format";
import { groupToneClass } from "../../utils/groupColor";
import { useValueChangePulse } from "../../hooks/useValueChangePulse";
import "./MatchCard.css";

type MineOutcome = "win" | "loss" | "draw" | "pending";

const OUTCOME_BADGE: Record<MineOutcome, { label: string; tone: "green" | "danger" | "neutral" | "gold" }> = {
  win: { label: "Vitória", tone: "green" },
  loss: { label: "Derrota", tone: "danger" },
  draw: { label: "Empate", tone: "neutral" },
  pending: { label: "A jogar", tone: "gold" },
};

/** Resultado do confronto do ponto de vista da dupla destacada; null quando ela não joga. */
function mineOutcome(match: Match, teamId: string | null | undefined): MineOutcome | null {
  if (!teamId || (match.teamAId !== teamId && match.teamBId !== teamId)) return null;
  if (!match.result) return "pending";
  const mine = match.teamAId === teamId ? match.result.setsA : match.result.setsB;
  const other = match.teamAId === teamId ? match.result.setsB : match.result.setsA;
  return mine > other ? "win" : mine < other ? "loss" : "draw";
}

interface MatchCardProps {
  match: Match;
  teamAName: string;
  teamBName: string;
  teamAStrength?: number;
  teamBStrength?: number;
  /** Matiz da cor de cada dupla (utils/teamColor). */
  teamAHue?: number;
  teamBHue?: number;
  teamAPlayers?: Player[];
  teamBPlayers?: Player[];
  highlightTeamId?: string | null;
  actions?: ReactNode;
  /** O formulário deste confronto está aberto. Não representa transmissão ao vivo. */
  live?: boolean;
}

export function MatchCard({ match, teamAName, teamBName, teamAStrength, teamBStrength, teamAHue, teamBHue, teamAPlayers = [], teamBPlayers = [], highlightTeamId, actions, live = false }: MatchCardProps) {
  const score = formatScore(match.result);
  const scoreRef = useValueChangePulse<HTMLDivElement>(score);
  const sides = [
    { id: match.teamAId, name: teamAName, strength: teamAStrength, hue: teamAHue, players: teamAPlayers, sets: match.result?.setsA, points: match.result ? pointsForResult(match.result, true) : null },
    { id: match.teamBId, name: teamBName, strength: teamBStrength, hue: teamBHue, players: teamBPlayers, sets: match.result?.setsB, points: match.result ? pointsForResult(match.result, false) : null },
  ];
  const outcome = mineOutcome(match, highlightTeamId);
  const groupTone = groupToneClass(match.groupId);
  return <Card className={`match-card${match.status === "realizado" ? " match-card-done" : ""}${live ? " match-card-editing" : ""}${outcome ? ` match-card-mine match-card-outcome-${outcome}` : ""}${groupTone ? ` ${groupTone}` : ""}`}>
    <div className="match-card-top">
      <strong className="match-card-order">Jogo {match.queuePosition ?? match.order + 1}</strong>
      <span className="match-card-round">{match.groupId ? <span className="group-pill">Grupo {match.groupId}</span> : match.round}{match.groupId && match.round !== `Grupo ${match.groupId}` ? ` · ${match.round}` : ""}</span>
      {outcome
        ? <Badge tone={OUTCOME_BADGE[outcome].tone}>{OUTCOME_BADGE[outcome].label}</Badge>
        : <Badge tone={match.status === "realizado" ? "green" : "info"}>{match.status === "realizado" ? "Finalizado" : "Próximo"}</Badge>}
    </div>
    <div className="match-card-teams">
      {sides.map((side, index) => {
        const won = match.result && (side.sets ?? 0) > (sides[1 - index].sets ?? 0);
        const isMine = Boolean(highlightTeamId) && side.id === highlightTeamId;
        return <div key={index} className={`match-card-team${isMine ? " match-card-team-mine" : ""}${won ? " match-card-team-winner" : ""}`}>
          <div className="match-card-faces">{side.players.map(player => <PlayerAvatar key={player.id} name={player.name} avatarUrl={player.avatarUrl} size="xs" />)}</div>
          <div className="match-card-team-identity"><strong><TeamCrest name={side.name} hue={side.hue} size="dot" />{side.name}</strong><TeamStrength value={side.strength} compact />{isMine && <span className="match-card-mine-label">Sua dupla</span>}</div>
          <div className="match-card-team-result"><strong aria-label={side.sets == null ? "Sem resultado" : `${side.sets} sets`}>{side.sets ?? "—"}</strong>{side.points != null && <span className="match-card-points">+{side.points} {side.points === 1 ? "pt" : "pts"}</span>}</div>
        </div>;
      })}
    </div>
    <div className="match-card-summary"><span>{live ? "Registrando resultado" : match.result ? "Placar final" : "Confronto a disputar"}</span><div className="match-card-score" ref={scoreRef}>{match.result ? score : "vs"}</div></div>
    {actions && <div className="match-card-actions">{actions}</div>}
  </Card>;
}
