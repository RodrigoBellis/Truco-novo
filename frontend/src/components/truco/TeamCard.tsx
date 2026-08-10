import type { Team } from "@truco/shared";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { initials } from "../../utils/format";
import "./TeamCard.css";

interface TeamCardProps {
  team: Team;
  highlight?: boolean;
}

export function TeamCard({ team, highlight = false }: TeamCardProps) {
  return (
    <Card accent={highlight ? "gold" : "none"} className="team-card">
      <div className="team-card-avatar">{initials(team.name)}</div>
      <div className="team-card-info">
        <strong>{team.name}</strong>
        <div className="team-card-badges">
          {team.groupId && <Badge tone="green">Grupo {team.groupId}</Badge>}
          {team.seeded && <Badge tone="gold">★ Cabeça de chave</Badge>}
          <Badge tone={team.status === "aprovada" ? "info" : "neutral"}>
            {team.status === "aprovada" ? "Aprovada" : "Pendente"}
          </Badge>
        </div>
      </div>
    </Card>
  );
}
