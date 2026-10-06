import type { GroupId, StandingRow } from "@truco/shared";
import { TeamCrest } from "./TeamCrest";
import { groupToneClass } from "../../utils/groupColor";
import type { OpponentInsight } from "../../utils/opponentInsight";
import "./MatchesHero.css";

interface MatchesHeroProps {
  teamName: string;
  /** Matiz da cor da dupla (utils/teamColor). */
  hue?: number;
  groupId: GroupId | null;
  /** Linha real da classificação do grupo; sem ela os números aparecem como travessão. */
  standing?: StandingRow;
  pendingCount: number;
  /** Próximo confronto pendente da dupla, com a leitura da tabela. */
  next?: { opponentName: string; insight: OpponentInsight } | null;
}

/**
 * Topo da tela Jogos num painel só: quem é a dupla, em qual grupo está, como anda a
 * campanha e quem vem pela frente.
 */
export function MatchesHero({ teamName, hue, groupId, standing, pendingCount, next }: MatchesHeroProps) {
  const stats = [
    { key: "points", label: "Pontos", value: standing?.pontos },
    { key: "win", label: "Vitórias", value: standing?.vitorias },
    { key: "loss", label: "Derrotas", value: standing?.derrotas },
    { key: "pending", label: "A jogar", value: pendingCount },
  ];

  return (
    <section className={`matches-hero${next ? "" : " matches-hero-solo"}`} aria-label="Sua dupla e seu grupo">
      <div className="matches-hero-team">
        <div className="matches-hero-identity">
          <TeamCrest name={teamName} hue={hue} size="lg" />
          <div className="matches-hero-identity-text">
            <span className="matches-hero-label">Sua dupla</span>
            <h2 className="matches-hero-name">{teamName}</h2>
            <p className="matches-hero-group">
              {groupId ? (
                <>
                  Está no <span className={`group-pill matches-hero-pill ${groupToneClass(groupId)}`}>Grupo {groupId}</span>
                  {standing && <strong>{standing.position}º lugar</strong>}
                </>
              ) : (
                "Grupo ainda não definido"
              )}
            </p>
          </div>
        </div>
        <dl className="matches-hero-stats">
          {stats.map((stat) => (
            <div key={stat.key} className={`matches-hero-stat matches-hero-stat-${stat.key}`}>
              <dt>{stat.label}</dt>
              <dd>{stat.value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

      {next && (
        <div className={`matches-hero-next matches-hero-next-${next.insight.tone}`}>
          <span className="matches-hero-label">Próximo jogo</span>
          <p className="matches-hero-opponent">
            <span className="matches-hero-vs">vs</span> {next.opponentName}
          </p>
          {next.insight.positionLabel && (
            <span className="matches-hero-chip">
              {next.insight.medal && <span aria-hidden="true">{next.insight.medal}</span>}
              {next.insight.positionLabel}
            </span>
          )}
          <p className="matches-hero-message">{next.insight.message}</p>
        </div>
      )}
    </section>
  );
}
