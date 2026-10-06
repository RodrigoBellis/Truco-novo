import { qualificationForPosition, type Player, type StandingRow, type Team } from "@truco/shared";
import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";
import { PlayerAvatar } from "../ui/PlayerAvatar";
import { TeamCrest } from "./TeamCrest";
import { TeamStrength } from "./TeamStrength";
import { teamHue, teamTintStyle } from "../../utils/teamColor";
import "./TeamIdentityCard.css";

interface TeamIdentityCardProps {
  team: Team;
  players: Player[];
  /** Duplas da edição: definem a cor única de cada uma. */
  teams?: Team[];
  standing?: StandingRow;
  playerId?: string | null;
  /** Minha Dupla já apresenta cada integrante em card próprio. */
  showMembers?: boolean;
}

const ZONE_LABEL = { semifinal: "Zona de semifinal", repescagem: "Zona de repescagem", eliminado: "Zona de eliminação" } as const;
const ZONE_TONE = { semifinal: "green", repescagem: "gold", eliminado: "danger" } as const;

export function TeamIdentityCard({ team, players, teams, standing, playerId, showMembers = true }: TeamIdentityCardProps) {
  const members = [team.player1Id, team.player2Id].map(id => players.find(player => player.id === id)).filter((player): player is Player => Boolean(player));
  const zone = standing ? qualificationForPosition(standing.position) : null;
  const hue = teamHue(team.id, teams);
  return <section className="team-identity team-tint" style={teamTintStyle(hue)} aria-label="Resumo da sua dupla">
    <div className="team-identity-head">
      <TeamCrest name={team.name} hue={hue} size="lg" />
      <h2>{team.name}</h2>
      <div className="team-identity-details"><TeamStrength value={team.strength} /><span><Icon name="group" size={16} />{team.groupId ? `Grupo ${team.groupId}` : "Grupo a definir"}</span>{team.seeded && <span><Icon name="star" size={16} />Cabeça de chave</span>}</div>
      <div className="team-identity-position">
        <strong aria-label={standing ? `${standing.position}º lugar` : "Posição a definir"}>{standing ? <>{standing.position}<small>º</small></> : "—"}</strong>
        <span>{standing ? (team.groupId ? `no Grupo ${team.groupId}` : "na classificação") : "Posição a definir"}</span>
      </div>
    </div>
    <div className="team-identity-foot">
      {showMembers && <div className="team-identity-members">{members.map(player => <div key={player.id} className="team-identity-member"><PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} size="sm" /><div><strong>{player.name}</strong><span>{player.id === playerId ? "Você" : "Seu parceiro"}</span></div></div>)}</div>}
      <div className="team-identity-status">
        {zone && <Badge tone={ZONE_TONE[zone]}>{ZONE_LABEL[zone]}</Badge>}
        <Badge tone={team.status === "aprovada" ? "neutral" : "gold"}>{team.status === "aprovada" ? "Dupla aprovada" : "Aprovação pendente"}</Badge>
      </div>
    </div>
  </section>;
}
