import { randomUUID } from "node:crypto";
import {
  EDITION_GROUP_IDS,
  TEAMS_PER_GROUP,
  groupDisplayName,
  MATCHES_PER_GROUP,
  PHASE_GROUPS,
  type BracketMatch,
  type BracketSlotSource,
  type DrawStatus,
  type EditionChampionRecord,
  type Group,
  type GroupId,
  type HistoryEntry,
  type Match,
  type MatchResult,
  type Player,
  type RankingEntry,
  type StandingOverride,
  type Team,
  type UserRole,
} from "@truco/shared";
import { generateGroupMatches } from "../services/groupMatchesService.js";
import { buildSchedule } from "../services/scheduleBuilder.js";
import { StoreConflictError, StoreOperationError } from "./storeErrors.js";
import type { EditionChampionInput, Store } from "./store.js";

// Armazenamento do MODO ENSAIO: tudo em memória, com dados fictícios. Nada aqui lê chave,
// cria cliente ou fala com o Supabase. Implementa o mesmo contrato do repositório real
// (Store), então rotas, middlewares, serviços e regras são exatamente os de produção.

/** Senha única das contas fictícias do ensaio. Não existe fora deste modo. */
export const REHEARSAL_PASSWORD = "ensaio-2026";
export const REHEARSAL_CHAMPIONSHIP_ID = "ensaio-edicao-5";
export const REHEARSAL_ADMIN_PLAYER_ID = "ensaio-admin";

export interface RehearsalAccount {
  /** Id da conta (o que seria o usuário do Supabase Auth). */
  id: string;
  playerId: string;
  role: UserRole;
  email: string;
  password: string;
  mustChangePassword: boolean;
}

interface ChampionshipRow {
  progression_revision?: number;
  progression_pending?: boolean;
  truco_id: string;
  edition: number;
  name: string;
  year: number;
  status: "em_andamento" | "encerrado";
  current_phase: string;
  draw_status: DrawStatus;
  results_locked: boolean;
  created_at: string;
  updated_at: string;
}

interface HistoryRow {
  id: string;
  championshipId: string;
  edition: number;
  name: string;
  year: number;
  championTeamId: string | null;
  runnerUpTeamId: string | null;
  finalResult: string | null;
  notes: string;
}

interface TeamRow {
  id: string;
  name: string;
  status: Team["status"];
  seeded: boolean;
  isPlaceholder: boolean;
  groupId: GroupId | null;
}

interface State {
  championship: ChampionshipRow;
  players: Array<{ id: string; name: string; avatarUrl: string | null }>;
  accounts: RehearsalAccount[];
  teams: TeamRow[];
  /** Participação por edição (truco_team_memberships). */
  memberships: Array<{ teamId: string; player1Id: string; player2Id: string; strength: number }>;
  /** Par histórico (truco_team_members): é por aqui que o Hall da Fama lê os nomes. */
  legacyMembers: Array<{ teamId: string; playerId: string; position: number }>;
  matches: Match[];
  bracket: BracketMatch[];
  overrides: Array<{ groupId: GroupId; teamId: string; position: number }>;
  history: HistoryRow[];
  audit: Array<{ id: string; matchId: string; actorId: string; action: string; createdAt: string; metadata: unknown }>;
  accountEvents: Array<{ actorId: string; accountId: string; action: string; playerId: string; createdAt: string }>;
}

const two = (value: number) => String(value).padStart(2, "0");
const groupRowId = (groupId: GroupId) => `ensaio-grupo-${groupId.toLowerCase()}`;
const VALID_SCORES = new Set(["2-0", "2-1", "1-2", "0-2"]);

function buildSeed(): State {
  const now = new Date().toISOString();
  // 14 jogadores da edição (7 duplas) + 2 que só existem no histórico (sem conta e sem dupla na edição).
  const players = Array.from({ length: 16 }, (_, index) => ({ id: `ensaio-jogador-${two(index + 1)}`, name: `Jogador ${index + 1}`, avatarUrl: null as string | null }));
  players.push({ id: REHEARSAL_ADMIN_PLAYER_ID, name: "Administrador", avatarUrl: null });

  const accounts: RehearsalAccount[] = players.slice(0, 14).map((player, index) => ({
    id: `ensaio-conta-${two(index + 1)}`, playerId: player.id, role: "jogador", email: `jogador${index + 1}@ensaio.invalid`, password: REHEARSAL_PASSWORD, mustChangePassword: false,
  }));
  // Como no banco real, a única conta administrativa é superadmin. O e-mail é o identificador
  // sintético que a tela de login manda em "Área administrativa" (não é segredo nem conta real).
  accounts.push({ id: "ensaio-conta-admin", playerId: REHEARSAL_ADMIN_PLAYER_ID, role: "superadmin", email: "admin@trucodonovo.com", password: REHEARSAL_PASSWORD, mustChangePassword: false });

  const teams: TeamRow[] = [];
  const memberships: State["memberships"] = [];
  EDITION_GROUP_IDS.forEach((groupId, groupIndex) => {
    for (let slot = 0; slot < TEAMS_PER_GROUP; slot += 1) {
      const first = players[groupIndex * TEAMS_PER_GROUP * 2 + slot * 2];
      const second = players[groupIndex * TEAMS_PER_GROUP * 2 + slot * 2 + 1];
      const id = `ensaio-dupla-${groupId.toLowerCase()}${slot + 1}`;
      teams.push({ id, name: `${first.name} & ${second.name}`, status: "aprovada", seeded: slot === 0, isPlaceholder: false, groupId });
      memberships.push({ teamId: id, player1Id: first.id, player2Id: second.id, strength: 3 });
    }
  });
  // Dupla que só existe no histórico (como uma campeã antiga que não joga esta edição).
  teams.push({ id: "ensaio-dupla-historica", name: "Jogador 15 & Jogador 16", status: "pendente", seeded: false, isPlaceholder: false, groupId: null });

  // Só as duplas que já foram campeãs têm par histórico; as demais são como duplas criadas
  // pela tela de administração, que só têm a participação da edição.
  const legacyMembers: State["legacyMembers"] = [
    { teamId: "ensaio-dupla-a1", playerId: players[0].id, position: 1 }, { teamId: "ensaio-dupla-a1", playerId: players[1].id, position: 2 },
    { teamId: "ensaio-dupla-a2", playerId: players[2].id, position: 1 }, { teamId: "ensaio-dupla-a2", playerId: players[3].id, position: 2 },
    { teamId: "ensaio-dupla-historica", playerId: players[14].id, position: 1 }, { teamId: "ensaio-dupla-historica", playerId: players[15].id, position: 2 },
  ];

  const champions = ["ensaio-dupla-a1", "ensaio-dupla-a1", "ensaio-dupla-historica", "ensaio-dupla-a2"];
  const history: HistoryRow[] = champions.map((championTeamId, index) => ({
    id: `ensaio-historico-${index + 1}`, championshipId: `ensaio-edicao-${index + 1}`, edition: index + 1, name: `${index + 1}ª Edição`, year: 2022 + index,
    championTeamId, runnerUpTeamId: null, finalResult: null, notes: "Edição fictícia do modo ensaio.",
  }));

  // Os 21 jogos saem da mesma regra do sistema (generateGroupMatches) e recebem a escala de
  // mesas pelo mesmo escalonador (buildSchedule), como o administrador faz antes do evento.
  const matches: Match[] = EDITION_GROUP_IDS.flatMap((groupId) =>
    generateGroupMatches(teams.filter((team) => team.groupId === groupId).map((team) => team.id)).map((pair) => ({
      id: `ensaio-jogo-${groupId.toLowerCase()}-${two(pair.order + 1)}`, championshipId: REHEARSAL_CHAMPIONSHIP_ID, stage: "grupos" as const, round: `Grupo ${groupId}`, order: pair.order,
      groupId, teamAId: pair.teamAId, teamBId: pair.teamBId, result: null, status: "pendente" as const, tableNumber: null, blockNumber: null, queuePosition: null,
    })));
  for (const assignment of buildSchedule(matches)) {
    Object.assign(matches.find((match) => match.id === assignment.matchId)!, { tableNumber: assignment.tableNumber, blockNumber: assignment.blockNumber, queuePosition: assignment.queuePosition });
  }

  return {
    championship: { truco_id: REHEARSAL_CHAMPIONSHIP_ID, edition: 5, name: "5ª Edição", year: 2026, status: "em_andamento", current_phase: PHASE_GROUPS, draw_status: "realizado", results_locked: true, created_at: now, updated_at: now },
    players, accounts, teams, memberships, legacyMembers, matches, bracket: [], overrides: [], history, audit: [], accountEvents: [],
  };
}

const copy = <T>(value: T): T => structuredClone(value);

export class RehearsalRepository implements Store {
  async applyKnockoutPlan(): Promise<boolean> { return false; }
  async getResultActor(actorId: string) {
    await this.enter("getResultActor");
    const account = this.findAccount({ id: actorId });
    return account ? { id: account.id, role: account.role, playerId: account.playerId, mustChangePassword: account.mustChangePassword, accessSetupRequired: false, sessionsValidAfter: null as string | null } : null;
  }
  private state = buildSeed();

  // ---------- Controles só do ensaio (não fazem parte do contrato do armazenamento) ----------

  /** Atraso aleatório (0 a N ms) em cada operação, para requisições simultâneas se intercalarem de verdade. */
  latencyMs = 0;
  /**
   * true (padrão): recusa duplicidade como o banco fará com a migration
   * 202610090001_knockout_uniqueness.sql aplicada. false: banco de hoje, sem essas restrições.
   */
  enforceUniqueness = true;
  private faults = new Map<string, number>();

  /** Volta tudo ao ponto de partida: 21 jogos sem placar, cadeado fechado, sem mata-mata. */
  reset(): void {
    this.state = buildSeed();
    this.latencyMs = 0;
    this.enforceUniqueness = true;
    this.faults.clear();
  }

  /** As próximas `times` chamadas de `operation` falham antes de gravar qualquer coisa. */
  failNext(operation: string, times = 1): void {
    this.faults.set(operation, times);
  }

  accounts(): RehearsalAccount[] {
    return copy(this.state.accounts);
  }

  findAccount(by: { id?: string; playerId?: string; email?: string }): RehearsalAccount | undefined {
    return this.state.accounts.find((account) => account.id === by.id || account.playerId === by.playerId || (by.email !== undefined && account.email === by.email));
  }

  setAccountPassword(accountId: string, password: string): void {
    const account = this.state.accounts.find((item) => item.id === accountId);
    if (account) Object.assign(account, { password, mustChangePassword: false });
  }

  /** Redefinição pelo administrador: senha temporária nova e troca obrigatória; cria a conta se faltar. */
  resetAccountPassword(playerId: string, password: string): RehearsalAccount {
    let account = this.state.accounts.find((item) => item.playerId === playerId);
    if (!account) {
      account = { id: `ensaio-conta-${playerId}`, playerId, role: "jogador", email: `${playerId}@ensaio.invalid`, password, mustChangePassword: true };
      this.state.accounts.push(account);
    }
    Object.assign(account, { password, mustChangePassword: true });
    return copy(account);
  }

  /** Auditoria de acessos do ensaio (sem senha). */
  recordAccountEvent(event: { actorId: string; accountId: string; action: string; playerId: string }): void {
    this.state.accountEvents.push({ ...event, createdAt: new Date().toISOString() });
  }

  accountEvents(): State["accountEvents"] {
    return copy(this.state.accountEvents);
  }

  playerName(playerId: string): string {
    return this.state.players.find((player) => player.id === playerId)?.name ?? "—";
  }

  /** Linhas cruas que Maiores Campeões lê no banco real (mesmo formato das tabelas). */
  majorChampionRows() {
    return copy({
      teams: this.state.teams.map((team) => ({ truco_id: team.id, status: team.status, is_placeholder: team.isPlaceholder })),
      members: this.state.legacyMembers.map((member) => ({ truco_team_id: member.teamId, truco_player_id: member.playerId, position: member.position })),
      memberships: this.state.memberships.map((item) => ({ truco_team_id: item.teamId, truco_player_1_id: item.player1Id, truco_player_2_id: item.player2Id })),
      players: this.state.players.map((player) => ({ truco_id: player.id, name: player.name })),
      history: this.state.history.map((row) => ({ champion_team_id: row.championTeamId, edition: row.edition })),
    });
  }

  /** O Hall da Fama no formato que o navegador lê direto do Supabase (truco_history com as duplas). */
  hallOfFameRows() {
    const team = (teamId: string | null) => {
      const row = teamId ? this.state.teams.find((item) => item.id === teamId) : undefined;
      if (!row) return null;
      return {
        name: row.name,
        truco_team_members: this.state.legacyMembers.filter((member) => member.teamId === row.id)
          .map((member) => ({ position: member.position, truco_players: { name: this.playerName(member.playerId) } })),
      };
    };
    return [...this.state.history].sort((a, b) => a.edition - b.edition).map((row) => ({
      truco_id: row.id, edition: row.edition, name: row.name, year: row.year, final_result: row.finalResult, notes: row.notes,
      champion: team(row.championTeamId), runner_up: team(row.runnerUpTeamId),
    }));
  }

  private async enter(operation: string): Promise<void> {
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, Math.random() * this.latencyMs));
    const pending = this.faults.get(operation) ?? 0;
    if (pending > 0) {
      this.faults.set(operation, pending - 1);
      throw new StoreOperationError(`Falha injetada no ensaio: ${operation}`, "08006");
    }
  }

  private conflict(message: string): void {
    if (this.enforceUniqueness) throw new StoreConflictError(`Conflito de unicidade: ${message}`);
  }

  private toTeam(row: TeamRow): Team | undefined {
    const membership = this.state.memberships.find((item) => item.teamId === row.id);
    if (!membership) return undefined;
    return { id: row.id, name: row.name, player1Id: membership.player1Id, player2Id: membership.player2Id, status: row.status, seeded: row.seeded, isPlaceholder: row.isPlaceholder, groupId: row.groupId, strength: membership.strength };
  }

  // ---------- Campeonato ----------

  newId(): string {
    return randomUUID();
  }

  async getCurrentChampionship() {
    await this.enter("getCurrentChampionship");
    return copy(this.state.championship);
  }

  isResultsLocked(championship: { results_locked?: boolean | null }): boolean {
    return championship.results_locked !== false;
  }

  async setResultsLocked(_championshipId: string, locked: boolean): Promise<void> {
    await this.enter("setResultsLocked");
    this.state.championship.results_locked = locked;
  }

  async setDrawStatus(_championshipId: string, status: DrawStatus): Promise<void> {
    await this.enter("setDrawStatus");
    this.state.championship.draw_status = status;
  }

  async setCurrentPhase(_championshipId: string, phase: string): Promise<void> {
    await this.enter("setCurrentPhase");
    this.state.championship.current_phase = phase;
  }

  // ---------- Jogadores ----------

  async listPlayers(): Promise<Player[]> {
    await this.enter("listPlayers");
    return this.state.players.map((player) => ({
      id: player.id,
      name: player.name,
      role: this.state.accounts.find((account) => account.playerId === player.id)?.role ?? "jogador",
      teamId: this.state.memberships.find((item) => item.player1Id === player.id || item.player2Id === player.id)?.teamId ?? null,
      avatarUrl: player.avatarUrl,
    }));
  }

  async setPlayerAvatar(playerId: string, avatarUrl: string): Promise<void> {
    await this.enter("setPlayerAvatar");
    const player = this.state.players.find((item) => item.id === playerId);
    if (player) player.avatarUrl = avatarUrl;
  }

  async getTeamIdForPlayer(playerId: string): Promise<string | null> {
    await this.enter("getTeamIdForPlayer");
    return this.state.memberships.find((item) => item.player1Id === playerId || item.player2Id === playerId)?.teamId ?? null;
  }

  async createPlayer(name: string): Promise<Player> {
    await this.enter("createPlayer");
    const player = { id: this.newId(), name: name.trim(), avatarUrl: null };
    this.state.players.push(player);
    return { id: player.id, name: player.name, role: "jogador", teamId: null, avatarUrl: null };
  }

  // ---------- Duplas ----------

  async listTeams(_championshipId: string): Promise<Team[]> {
    await this.enter("listTeams");
    return this.state.teams.flatMap((row) => this.toTeam(row) ?? []);
  }

  async getTeam(teamId: string): Promise<Team | undefined> {
    await this.enter("getTeam");
    const row = this.state.teams.find((team) => team.id === teamId);
    return row ? this.toTeam(row) : undefined;
  }

  async approvedTeams(championshipId: string): Promise<Team[]> {
    return (await this.listTeams(championshipId)).filter((team) => team.status === "aprovada");
  }

  async approveTeam(teamId: string): Promise<Team> {
    await this.setTeamStatus(teamId, "aprovada");
    const team = await this.getTeam(teamId);
    if (!team) throw new Error("Dupla não encontrada após aprovação.");
    return team;
  }

  async setTeamStatus(teamId: string, status: Team["status"]): Promise<void> {
    await this.enter("setTeamStatus");
    const row = this.state.teams.find((team) => team.id === teamId);
    if (row) row.status = status;
  }

  async isTeamInHistory(teamId: string): Promise<boolean> {
    await this.enter("isTeamInHistory");
    return this.state.history.some((row) => row.championTeamId === teamId || row.runnerUpTeamId === teamId);
  }

  async rejectTeam(teamId: string): Promise<void> {
    await this.enter("rejectTeam");
    this.state.teams = this.state.teams.filter((team) => team.id !== teamId);
    this.state.memberships = this.state.memberships.filter((item) => item.teamId !== teamId);
  }

  async renameTeam(teamId: string, name: string): Promise<Team> {
    await this.enter("renameTeam");
    const row = this.state.teams.find((team) => team.id === teamId);
    if (row) row.name = name;
    const team = row ? this.toTeam(row) : undefined;
    if (!team) throw new Error("Dupla não encontrada após renomear.");
    return team;
  }

  async createTeamParticipation(input: { championshipId: string; name: string; player1Id: string; player2Id: string; groupId: GroupId; strength: number }): Promise<Team> {
    await this.enter("createTeamParticipation");
    const row: TeamRow = { id: this.newId(), name: input.name.trim(), status: "aprovada", seeded: false, isPlaceholder: false, groupId: input.groupId };
    this.state.teams.push(row);
    this.state.memberships.push({ teamId: row.id, player1Id: input.player1Id, player2Id: input.player2Id, strength: input.strength });
    return this.toTeam(row)!;
  }

  async updateTeamParticipation(teamId: string, input: { championshipId: string; name: string; player1Id: string; player2Id: string; groupId: GroupId; strength: number }): Promise<Team> {
    await this.enter("updateTeamParticipation");
    const row = this.state.teams.find((team) => team.id === teamId);
    const membership = this.state.memberships.find((item) => item.teamId === teamId);
    if (!row || !membership) throw new Error("Falha ao atualizar participação da dupla: Participação não encontrada nesta edição");
    Object.assign(row, { name: input.name.trim(), groupId: input.groupId });
    Object.assign(membership, { player1Id: input.player1Id, player2Id: input.player2Id, strength: input.strength });
    return this.toTeam(row)!;
  }

  // ---------- Grupos ----------

  async listGroups(_championshipId: string): Promise<Group[]> {
    await this.enter("listGroups");
    return EDITION_GROUP_IDS.map((groupId) => ({
      id: groupId,
      name: groupDisplayName(groupId),
      teamIds: this.state.teams.filter((team) => team.status === "aprovada" && team.groupId === groupId).map((team) => team.id),
    }));
  }

  async getGroup(championshipId: string, groupId: GroupId): Promise<Group> {
    const group = (await this.listGroups(championshipId)).find((item) => item.id === groupId);
    if (!group) throw new Error(`Grupo ${groupId} não encontrado`);
    return group;
  }

  async getGroupRowId(_championshipId: string, groupId: GroupId): Promise<string> {
    await this.enter("getGroupRowId");
    return groupRowId(groupId);
  }

  async listStandingOverrides(_championshipId: string, rowId: string): Promise<StandingOverride[]> {
    await this.enter("listStandingOverrides");
    // Uma decisão mais recente para a mesma dupla substitui a anterior.
    const latest = new Map(this.state.overrides.filter((item) => groupRowId(item.groupId) === rowId).map((item) => [item.teamId, item.position]));
    return [...latest].map(([teamId, position]) => ({ teamId, position }));
  }

  async saveStandingOverrides(input: { championshipId: string; groupRowId: string; actorId: string; decisions: StandingOverride[] }): Promise<void> {
    await this.enter("saveStandingOverrides");
    const groupId = EDITION_GROUP_IDS.find((id) => groupRowId(id) === input.groupRowId)!;
    this.state.overrides.push(...input.decisions.map((decision) => ({ groupId, ...decision })));
  }

  async ensureGroups(_championshipId: string): Promise<void> {
    await this.enter("ensureGroups");
  }

  async clearTeamGroups(_championshipId: string): Promise<void> {
    await this.enter("clearTeamGroups");
    this.state.teams.forEach((team) => { team.groupId = null; });
  }

  async assignTeamsToGroups(assignments: Record<GroupId, string[]>, _championshipId: string): Promise<void> {
    await this.enter("assignTeamsToGroups");
    for (const groupId of EDITION_GROUP_IDS) {
      for (const teamId of assignments[groupId] ?? []) {
        const row = this.state.teams.find((team) => team.id === teamId);
        if (row) row.groupId = groupId;
      }
    }
  }

  // ---------- Partidas ----------

  async listMatches(_championshipId: string, filters: { stage?: string; groupLabel?: string; teamId?: string } = {}): Promise<Match[]> {
    await this.enter("listMatches");
    return copy(this.state.matches
      .filter((match) => !filters.stage || match.stage === filters.stage)
      .filter((match) => !filters.groupLabel || match.groupId === filters.groupLabel)
      .filter((match) => !filters.teamId || match.teamAId === filters.teamId || match.teamBId === filters.teamId))
      .sort((a, b) => a.order - b.order);
  }

  async getMatch(matchId: string): Promise<Match | undefined> {
    await this.enter("getMatch");
    const match = this.state.matches.find((item) => item.id === matchId);
    return match ? copy(match) : undefined;
  }

  async getMatchPlayerIds(_championshipId: string, teamAId: string, teamBId: string): Promise<{ playerIds: string[] }> {
    await this.enter("getMatchPlayerIds");
    const a = this.state.memberships.find((item) => item.teamId === teamAId);
    const b = this.state.memberships.find((item) => item.teamId === teamBId);
    if (!a || !b) return { playerIds: [] };
    return { playerIds: [a.player1Id, a.player2Id, b.player1Id, b.player2Id] };
  }

  private pushGroupMatches(groupId: GroupId, pairs: Array<{ teamAId: string; teamBId: string; order: number }>): void {
    this.state.matches.push(...pairs.map((pair) => ({
      id: this.newId(), championshipId: REHEARSAL_CHAMPIONSHIP_ID, stage: "grupos" as const, round: `Grupo ${groupId}`, order: pair.order, groupId,
      teamAId: pair.teamAId, teamBId: pair.teamBId, result: null, status: "pendente" as const, tableNumber: null, blockNumber: null, queuePosition: null,
    })));
  }

  async createGroupMatches(_championshipId: string, groupId: GroupId, pairs: Array<{ teamAId: string; teamBId: string; order: number }>): Promise<void> {
    await this.enter("createGroupMatches");
    this.pushGroupMatches(groupId, pairs);
  }

  async setPendingMatchOrders(items: Array<{ matchId: string; order: number }>): Promise<void> {
    await this.enter("setPendingMatchOrders");
    for (const item of items) {
      const match = this.state.matches.find((candidate) => candidate.id === item.matchId && candidate.status === "pendente");
      if (match) match.order = item.order;
    }
  }

  async createAllGroupMatches(_championshipId: string, fixtures: Record<GroupId, Array<{ teamAId: string; teamBId: string; order: number }>>): Promise<void> {
    await this.enter("createAllGroupMatches");
    if (EDITION_GROUP_IDS.some((groupId) => fixtures[groupId].length !== MATCHES_PER_GROUP)) throw new RangeError(`A edição deve gerar ${MATCHES_PER_GROUP} partidas por grupo.`);
    EDITION_GROUP_IDS.forEach((groupId) => this.pushGroupMatches(groupId, fixtures[groupId]));
  }

  async createMatch(input: { championshipId: string; stage: Match["stage"]; round: string; order: number; teamAId: string; teamBId: string }): Promise<Match> {
    await this.enter("createMatch");
    if (input.stage === "mata-mata" && this.state.matches.some((match) => match.stage === "mata-mata" && match.round === input.round && match.order === input.order)) {
      this.conflict(`já existe jogo de mata-mata para ${input.round} ${input.order + 1}`);
    }
    const match: Match = {
      id: this.newId(), championshipId: input.championshipId, stage: input.stage, round: input.round, order: input.order, groupId: null,
      teamAId: input.teamAId, teamBId: input.teamBId, result: null, status: "pendente", tableNumber: null, blockNumber: null, queuePosition: null,
    };
    this.state.matches.push(match);
    return copy(match);
  }

  async setMatchTeam(matchId: string, side: "A" | "B", teamId: string): Promise<void> {
    await this.enter("setMatchTeam");
    const match = this.state.matches.find((item) => item.id === matchId && item.status === "pendente");
    if (!match) return;
    if (side === "A") match.teamAId = teamId; else match.teamBId = teamId;
  }

  async listMatchResultAudit(_championshipId: string) {
    await this.enter("listMatchResultAudit");
    return [...this.state.audit].reverse().map((row) => ({
      ...copy(row),
      actorName: this.playerName(this.state.accounts.find((account) => account.id === row.actorId)?.playerId ?? ""),
    }));
  }

  /** Como truco_rpc_record_match_result: valida, grava o placar e a auditoria de uma vez. */
  async saveMatchResult(input: { championshipId: string; matchId: string; result: MatchResult; actorId: string }): Promise<void> {
    await this.enter("saveMatchResult");
    if (!VALID_SCORES.has(`${input.result.setsA}-${input.result.setsB}`)) throw new Error("Falha ao salvar resultado e auditoria: Placar inválido; use 2x0, 2x1, 1x2 ou 0x2");
    const match = this.state.matches.find((item) => item.id === input.matchId && item.championshipId === input.championshipId);
    if (!match) throw new Error("Falha ao salvar resultado e auditoria: Partida não encontrada nesta edição");
    if (match.result?.setsA === input.result.setsA && match.result?.setsB === input.result.setsB) return;
    this.state.audit.push({
      id: this.newId(), matchId: match.id, actorId: input.actorId, action: match.result ? "result_updated" : "result_created", createdAt: new Date().toISOString(),
      metadata: { previous: match.result ? { ...match.result } : null, next: { ...input.result } },
    });
    match.result = { ...input.result };
    match.status = "realizado";
  }

  async applyScheduleAssignments(assignments: Array<{ matchId: string; tableNumber: number; blockNumber: number; queuePosition: number }>): Promise<void> {
    await this.enter("applyScheduleAssignments");
    for (const assignment of assignments) {
      const match = this.state.matches.find((item) => item.id === assignment.matchId);
      if (match) Object.assign(match, { tableNumber: assignment.tableNumber, blockNumber: assignment.blockNumber, queuePosition: assignment.queuePosition });
    }
  }

  async setMatchSchedule(matchId: string, patch: { tableNumber?: number | null; queuePosition?: number | null }): Promise<void> {
    await this.enter("setMatchSchedule");
    const match = this.state.matches.find((item) => item.id === matchId);
    if (!match) return;
    if (patch.tableNumber !== undefined) match.tableNumber = patch.tableNumber;
    if (patch.queuePosition !== undefined) match.queuePosition = patch.queuePosition;
  }

  async clearMatchesAndBracket(_championshipId: string): Promise<void> {
    await this.enter("clearMatchesAndBracket");
    this.state.bracket = [];
    this.state.matches = [];
  }

  // ---------- Mata-mata ----------

  async listBracketMatches(_championshipId: string): Promise<BracketMatch[]> {
    await this.enter("listBracketMatches");
    return copy(this.state.bracket).sort((a, b) => a.order - b.order);
  }

  async createBracketMatches(_championshipId: string, rows: Array<{ id: string; round: BracketMatch["round"]; label: string; order: number; slotA: BracketSlotSource; slotB: BracketSlotSource }>): Promise<void> {
    await this.enter("createBracketMatches");
    // Uma única inserção: ou entram os sete confrontos, ou nenhum.
    if (rows.some((row) => this.state.bracket.some((item) => item.round === row.round && item.order === row.order))) {
      this.conflict("o chaveamento desta edição já tem esse confronto");
    }
    this.state.bracket.push(...rows.map((row) => ({ ...copy(row), matchId: null })));
  }

  async deletePendingKnockoutMatch(matchId: string): Promise<void> {
    await this.enter("deletePendingKnockoutMatch");
    const match = this.state.matches.find((item) => item.id === matchId && item.stage === "mata-mata" && item.status === "pendente");
    if (!match) return;
    this.state.matches = this.state.matches.filter((item) => item !== match);
    // No banco, o vínculo é desfeito pela chave estrangeira.
    this.state.bracket.forEach((item) => { if (item.matchId === matchId) item.matchId = null; });
  }

  async linkBracketMatch(bracketMatchId: string, matchId: string): Promise<void> {
    await this.enter("linkBracketMatch");
    if (this.state.bracket.some((item) => item.matchId === matchId && item.id !== bracketMatchId)) this.conflict("o jogo já está vinculado a outro confronto");
    const item = this.state.bracket.find((candidate) => candidate.id === bracketMatchId);
    if (item) item.matchId = matchId;
  }

  async clearKnockout(_championshipId: string): Promise<void> {
    await this.enter("clearKnockout");
    this.state.bracket = [];
    // Segunda instrução no banco real: uma falha aqui deixa jogos pendentes sem chaveamento.
    await this.enter("clearKnockout:matches");
    this.state.matches = this.state.matches.filter((match) => match.stage !== "mata-mata" || match.status !== "pendente");
  }

  // ---------- Histórico ----------

  async listHistory(): Promise<HistoryEntry[]> {
    await this.enter("listHistory");
    const names = (teamId: string | null): [string, string] | null => {
      const members = this.state.legacyMembers.filter((member) => member.teamId === teamId).sort((a, b) => a.position - b.position);
      return members.length >= 2 ? [this.playerName(members[0].playerId), this.playerName(members[1].playerId)] : null;
    };
    return [...this.state.history].sort((a, b) => a.edition - b.edition).map((row) => ({
      id: row.id, edition: row.edition, name: row.name, year: row.year,
      champions: names(row.championTeamId) ?? ["—", "—"], runnersUp: names(row.runnerUpTeamId), finalResult: row.finalResult, notes: row.notes,
    }));
  }

  async addHistoryEntry(entry: { championshipId: string; edition: number; name: string; year: number; championTeamId: string; runnerUpTeamId: string; finalResult: string; notes: string }): Promise<void> {
    await this.enter("addHistoryEntry");
    // UNIQUE (edition) existe no banco real.
    if (this.state.history.some((row) => row.edition === entry.edition)) throw new StoreConflictError("Conflito de unicidade: a edição já está no histórico");
    this.state.history.push({ id: this.newId(), ...entry });
  }

  async countHistoryEntries(): Promise<number> {
    await this.enter("countHistoryEntries");
    return this.state.history.length;
  }

  async getEditionChampion(championshipId: string): Promise<EditionChampionRecord | null> {
    await this.enter("getEditionChampion");
    const row = this.state.history.find((item) => item.championshipId === championshipId);
    return row ? { championTeamId: row.championTeamId, runnerUpTeamId: row.runnerUpTeamId, finalResult: row.finalResult } : null;
  }

  async saveEditionChampion(entry: EditionChampionInput): Promise<void> {
    await this.enter("saveEditionChampion");
    // Falha ao preservar os pares deve ocorrer antes de publicar a linha do campeão.
    await this.enter("saveEditionChampion:pairs");
    const rows = this.state.history.filter((item) => item.championshipId === entry.championshipId);
    rows.forEach((row) => Object.assign(row, { championTeamId: entry.championTeamId, runnerUpTeamId: entry.runnerUpTeamId, finalResult: entry.finalResult, notes: entry.notes }));
    if (rows.length === 0) {
      // No banco real a atualização e a inserção são duas instruções.
      await this.enter("saveEditionChampion:insert");
      if (this.state.history.some((row) => row.edition === entry.edition)) throw new StoreConflictError("Conflito de unicidade: a edição já está no histórico");
      this.state.history.push({ id: this.newId(), ...entry });
    }
    for (const teamId of [entry.championTeamId, entry.runnerUpTeamId]) {
      const membership = this.state.memberships.find((item) => item.teamId === teamId);
      if (!membership || this.state.legacyMembers.some((member) => member.teamId === teamId)) continue;
      this.state.legacyMembers.push({ teamId, playerId: membership.player1Id, position: 1 }, { teamId, playerId: membership.player2Id, position: 2 });
    }
  }

  // ---------- Ranking ----------

  async listRanking(): Promise<RankingEntry[]> {
    await this.enter("listRanking");
    const titles = new Map<string, number>();
    for (const row of this.state.history) {
      for (const member of this.state.legacyMembers.filter((item) => item.teamId === row.championTeamId)) titles.set(member.playerId, (titles.get(member.playerId) ?? 0) + 1);
    }
    return this.state.players
      .map((player) => ({ playerId: player.id, playerName: player.name, titles: titles.get(player.id) ?? 0 }))
      .sort((a, b) => b.titles - a.titles || a.playerName.localeCompare(b.playerName));
  }
}

let instance: RehearsalRepository | null = null;

/** Instância única do processo. Só é criada quando o modo ensaio está ligado. */
export function createRehearsalStore(): RehearsalRepository {
  instance ??= new RehearsalRepository();
  return instance;
}

/** Para as rotas e os testes do ensaio; fora do modo ensaio não existe armazenamento em memória. */
export function rehearsalStore(): RehearsalRepository {
  if (!instance) throw new Error("O armazenamento em memória só existe no modo ensaio (TRUCO_REHEARSAL=1).");
  return instance;
}
