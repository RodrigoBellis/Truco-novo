import { EDITION_TEAM_COUNT, TEAMS_PER_GROUP, isValidTeamStrength, type GroupId, type Player, type Team } from "@truco/shared";

export interface TeamParticipationInput {
  name: string;
  player1Id: string;
  player2Id: string;
  groupId: GroupId;
  strength: number;
}

export function validateTeamParticipation(input: TeamParticipationInput, teams: Team[], players: Player[], editingTeamId?: string): string | null {
  if (!input.name.trim()) return "Informe o nome da dupla.";
  if (!input.player1Id || !input.player2Id || input.player1Id === input.player2Id) return "Escolha dois jogadores diferentes.";
  if (input.groupId !== "A" && input.groupId !== "B") return "Escolha o Grupo A ou B.";
  if (!isValidTeamStrength(input.strength)) return "A força deve ser de 1 a 5 estrelas.";
  if (!players.some((player) => player.id === input.player1Id) || !players.some((player) => player.id === input.player2Id)) {
    return "Selecione dois jogadores cadastrados.";
  }
  const activeTeams = teams.filter((team) => team.status === "aprovada" && team.id !== editingTeamId);
  const currentTeam = teams.find((team) => team.id === editingTeamId);
  const editingApprovedTeam = currentTeam?.status === "aprovada";
  const activeTeamsInGroup = activeTeams.filter((team) => team.groupId === input.groupId);
  if (!editingApprovedTeam && activeTeams.length >= EDITION_TEAM_COUNT) return `A edição comporta ${EDITION_TEAM_COUNT} duplas aprovadas.`;
  // Vale também para dupla já aprovada que muda de grupo: activeTeams não conta a própria dupla.
  if (activeTeamsInGroup.length >= TEAMS_PER_GROUP) return `O Grupo ${input.groupId} já tem ${TEAMS_PER_GROUP} duplas.`;
  const otherTeams = teams.filter((team) => team.id !== editingTeamId);
  if (otherTeams.some((team) => [team.player1Id, team.player2Id].includes(input.player1Id) || [team.player1Id, team.player2Id].includes(input.player2Id))) {
    return "Cada jogador só pode participar de uma dupla nesta edição.";
  }
  return null;
}

export function validateTeamStatusChange(teams: Team[], teamId: string, status: Team["status"]): string | null {
  const team = teams.find((candidate) => candidate.id === teamId);
  if (!team) return "Participação não encontrada nesta edição.";
  if (team.status === status) return null;
  if (status === "aprovada") {
    const active = teams.filter((candidate) => candidate.status === "aprovada");
    if (active.length >= EDITION_TEAM_COUNT) return `A edição comporta ${EDITION_TEAM_COUNT} duplas aprovadas.`;
    if (!team.groupId || active.filter((candidate) => candidate.groupId === team.groupId).length >= TEAMS_PER_GROUP) return `Cada grupo comporta ${TEAMS_PER_GROUP} duplas aprovadas.`;
  }
  return null;
}
