import type { Player, Team, Group, Match, BracketMatch, RankingEntry, HistoryEntry, GroupId, DrawStatus } from "@truco/shared";
import { SEED_PLAYERS, SEED_TEAMS, SEED_RANKING, SEED_HISTORY } from "./seed.js";
import { DEFAULT_PASSWORD, type Credential } from "./credentials.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildCredentials(players: Player[]): Credential[] {
  return players.map((player) => ({
    playerId: player.id,
    password: DEFAULT_PASSWORD,
    mustChangePassword: true,
  }));
}

class TrucoStore {
  players: Player[] = clone(SEED_PLAYERS);
  teams: Team[] = clone(SEED_TEAMS);
  groups: Group[] = [
    { id: "A", name: "Grupo A", teamIds: [] },
    { id: "B", name: "Grupo B", teamIds: [] },
  ];
  matches: Match[] = [];
  bracketMatches: BracketMatch[] = [];
  ranking: RankingEntry[] = clone(SEED_RANKING);
  history: HistoryEntry[] = clone(SEED_HISTORY);
  drawStatus: DrawStatus = "pendente";
  currentPhase = "Aguardando sorteio";
  credentials: Credential[] = buildCredentials(clone(SEED_PLAYERS));

  reset(): void {
    this.players = clone(SEED_PLAYERS);
    this.teams = clone(SEED_TEAMS);
    this.groups = [
      { id: "A", name: "Grupo A", teamIds: [] },
      { id: "B", name: "Grupo B", teamIds: [] },
    ];
    this.matches = [];
    this.bracketMatches = [];
    this.ranking = clone(SEED_RANKING);
    this.history = clone(SEED_HISTORY);
    this.drawStatus = "pendente";
    this.currentPhase = "Aguardando sorteio";
    this.credentials = buildCredentials(this.players);
  }

  getTeam(teamId: string): Team | undefined {
    return this.teams.find((t) => t.id === teamId);
  }

  getCredential(playerId: string): Credential | undefined {
    return this.credentials.find((c) => c.playerId === playerId);
  }

  getGroup(groupId: GroupId): Group {
    const group = this.groups.find((g) => g.id === groupId);
    if (!group) throw new Error(`Grupo ${groupId} não encontrado`);
    return group;
  }

  approvedTeams(): Team[] {
    return this.teams.filter((t) => t.status === "aprovada");
  }
}

export const store = new TrucoStore();
