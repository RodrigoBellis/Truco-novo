import { groupDisplayName } from "@truco/shared";
import { Fragment, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { Player, Team } from "@truco/shared";
import { Icon } from "../ui/Icon";
import { PlayerAvatar } from "../ui/PlayerAvatar";
import { groupToneClass } from "../../utils/groupColor";
import { teamHue, teamTintStyle } from "../../utils/teamColor";
import "./HomeTeamHero.css";

interface HomeTeamHeroProps {
  team: Team;
  players: Player[];
  /** Duplas da edição: definem a cor única de cada uma. */
  teams: Team[];
  playerId?: string | null;
}

/**
 * Card protagonista do Início: a dupla do jogador, quem joga nela, a força e o grupo.
 * Não mostra posição, zona nem números da campanha: isso mora em Minha Dupla e Grupos.
 */
export function HomeTeamHero({ team, players, teams, playerId }: HomeTeamHeroProps) {
  const members = [team.player1Id, team.player2Id].map((id) => players.find((player) => player.id === id)).filter((player): player is Player => Boolean(player));
  const includesMe = members.some((player) => player.id === playerId);
  const strength = team.strength != null && Number.isInteger(team.strength) && team.strength >= 1 && team.strength <= 5 ? team.strength : null;
  return (
    <section className={`home-hero team-tint${members.length === 0 ? " home-hero-no-duo" : ""}`} style={teamTintStyle(teamHue(team.id, teams))} aria-label="Resumo da sua dupla">
      <span className="home-hero-light" aria-hidden="true" />
      <div className="home-hero-head">
        <p className="home-hero-eyebrow"><Icon name="spade" size={14} />Sua dupla</p>
        <h2 className="home-hero-name">{team.name}</h2>
      </div>

      {members.length > 0 && (
        <div className="home-hero-duo">
          {members.map((player, index) => (
            <Fragment key={player.id}>
              {index > 0 && <span className="home-hero-amp" aria-hidden="true">&amp;</span>}
              <div className="home-hero-member">
                <span className="home-hero-face"><PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} size="lg" /></span>
                <strong>{player.name}</strong>
                <span className={`home-hero-role${player.id === playerId ? " home-hero-role-me" : ""}`}>{player.id === playerId ? "Você" : includesMe ? "Seu parceiro" : "Integrante"}</span>
              </div>
            </Fragment>
          ))}
        </div>
      )}

      <div className="home-hero-meta">
        <div className="home-hero-strength">
          {strength != null && (
            <span className="home-hero-stars" aria-hidden="true">
              {Array.from({ length: 5 }, (_, index) => (
                <span key={index} className={`home-hero-star${index < strength ? " is-lit" : ""}`} style={{ "--star-index": index } as CSSProperties}>
                  <Icon name="star" size={32} />
                  {index < strength && <span className="home-hero-star-lit"><Icon name="star" size={32} /></span>}
                </span>
              ))}
            </span>
          )}
          <span className={`home-hero-strength-label${strength == null ? " is-pending" : ""}`}>{strength != null ? `Força ${strength} de 5` : "Força a definir"}</span>
        </div>
        {team.groupId
          ? <p className={`home-hero-group ${groupToneClass(team.groupId)}`}><span>Grupo</span> <strong>{groupDisplayName(team.groupId).replace(/^Grupo /, "")}</strong></p>
          : <p className="home-hero-group is-pending">Grupo a definir</p>}
      </div>

      <Link className="home-hero-cta" to="/grupos"><span>{team.groupId ? "Ver meu grupo" : "Ver grupos"}</span><Icon name="arrow" size={20} /></Link>
    </section>
  );
}
