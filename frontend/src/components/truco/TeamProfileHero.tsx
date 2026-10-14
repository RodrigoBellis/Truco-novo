import { groupDisplayName } from "@truco/shared";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { Player, StandingRow, Team } from "@truco/shared";
import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";
import { PlayerAvatar } from "../ui/PlayerAvatar";
import { groupToneClass } from "../../utils/groupColor";
import { teamHue, teamTintStyle } from "../../utils/teamColor";
import "./TeamProfileHero.css";

interface TeamProfileHeroProps {
  team: Team;
  players: Player[];
  /** Duplas da edição: definem a cor única de cada uma. */
  teams: Team[];
  /** Linha da dupla na classificação central; sem ela a posição não aparece. */
  standing?: StandingRow;
  playerId?: string | null;
}

/**
 * Card protagonista de Minha Dupla: os dois jogadores, o nome da dupla, a força e o grupo.
 * Os números da campanha ficam em `TeamPerformanceStrip` e os jogos em `TeamRecentResults`.
 */
export function TeamProfileHero({ team, players, teams, standing, playerId }: TeamProfileHeroProps) {
  const members = [team.player1Id, team.player2Id].map((id) => players.find((player) => player.id === id)).filter((player): player is Player => Boolean(player));
  const includesMe = members.some((player) => player.id === playerId);
  const strength = team.strength != null && Number.isInteger(team.strength) && team.strength >= 1 && team.strength <= 5 ? team.strength : null;
  return (
    <section className="team-profile team-tint" style={teamTintStyle(teamHue(team.id, teams))} aria-label="Perfil da sua dupla">
      <span className="team-profile-light" aria-hidden="true" />

      <div className="team-profile-main">
        {members.length > 0 && (
          <div className="team-profile-duo">
            {members.map((player) => (
              <div key={player.id} className="team-profile-member">
                <span className="team-profile-face"><PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} size="lg" /></span>
                <strong>{player.name}</strong>
                <span className={`team-profile-role${player.id === playerId ? " team-profile-role-me" : ""}`}>{player.id === playerId ? "Você" : includesMe ? "Seu parceiro" : "Integrante"}</span>
              </div>
            ))}
          </div>
        )}

        <div className="team-profile-identity">
          <h2 className="team-profile-name">{team.name}</h2>
          <div className="team-profile-strength">
            {strength != null && (
              <span className="team-profile-stars" aria-hidden="true">
                {Array.from({ length: 5 }, (_, index) => (
                  <span key={index} className="team-profile-star" style={{ "--star-index": index } as CSSProperties}>
                    <Icon name="star" size={28} />
                    {index < strength && <span className="team-profile-star-lit"><Icon name="star" size={28} /></span>}
                  </span>
                ))}
              </span>
            )}
            <span className={`team-profile-strength-label${strength == null ? " is-pending" : ""}`}>{strength != null ? `Força ${strength} de 5` : "Força a definir"}</span>
          </div>
          {team.status !== "aprovada" && <Badge tone="gold">Aprovação pendente</Badge>}
        </div>
      </div>

      <div className="team-profile-aside">
        <div className="team-profile-group">
          {team.groupId
            ? <p className={`team-profile-group-mark ${groupToneClass(team.groupId)}`}><span>Grupo</span> <strong>{groupDisplayName(team.groupId).replace(/^Grupo /, "")}</strong></p>
            : <p className="team-profile-group-mark is-pending">Grupo a definir</p>}
          {standing && <p className="team-profile-position">{standing.position}º lugar</p>}
        </div>
        <Link className="team-profile-cta" to="/grupos"><span>{team.groupId ? "Ver meu grupo" : "Ver grupos"}</span><Icon name="arrow" size={18} /></Link>
      </div>
    </section>
  );
}
