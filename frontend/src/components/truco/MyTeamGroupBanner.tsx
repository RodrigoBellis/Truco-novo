import type { GroupId, StandingRow } from "@truco/shared";
import { TeamCrest } from "./TeamCrest";
import { groupToneClass } from "../../utils/groupColor";
import "./MyTeamGroupBanner.css";

interface MyTeamGroupBannerProps {
  teamName: string;
  /** Matiz da cor da dupla (utils/teamColor). */
  hue?: number;
  groupId: GroupId | null;
  /** Linha real da classificação do grupo; sem ela os números aparecem como travessão. */
  standing?: StandingRow;
  pendingCount: number;
}

/** Faixa da tela Jogos que deixa claro em qual grupo a dupla está e como anda a campanha. */
export function MyTeamGroupBanner({ teamName, hue, groupId, standing, pendingCount }: MyTeamGroupBannerProps) {
  return (
    <section className={`my-team-banner ${groupToneClass(groupId)}`.trim()} aria-label="Sua dupla e seu grupo">
      <TeamCrest name={teamName} hue={hue} size="md" />
      <div className="my-team-banner-identity">
        <span className="my-team-banner-label">Sua dupla</span>
        <strong className="my-team-banner-name">{teamName}</strong>
        <span className="my-team-banner-group">
          {groupId ? (
            <>
              Está no <span className="group-pill my-team-banner-pill">Grupo {groupId}</span>
              {standing && <span className="my-team-banner-position">{standing.position}º lugar</span>}
            </>
          ) : (
            "Grupo ainda não definido"
          )}
        </span>
      </div>
      <dl className="my-team-banner-stats">
        <div>
          <dt>Pontos</dt>
          <dd>{standing?.pontos ?? "—"}</dd>
        </div>
        <div className="my-team-banner-stat-win">
          <dt>Vitórias</dt>
          <dd>{standing?.vitorias ?? "—"}</dd>
        </div>
        <div className="my-team-banner-stat-loss">
          <dt>Derrotas</dt>
          <dd>{standing?.derrotas ?? "—"}</dd>
        </div>
        <div className="my-team-banner-stat-pending">
          <dt>A jogar</dt>
          <dd>{pendingCount}</dd>
        </div>
      </dl>
    </section>
  );
}
