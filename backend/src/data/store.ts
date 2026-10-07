import { randomUUID } from "node:crypto";
import type {
  Player,
  Team,
  Group,
  Match,
  MatchResult,
  BracketMatch,
  BracketSlotSource,
  RankingEntry,
  HistoryEntry,
  GroupId,
  DrawStatus,
  UserRole,
} from "@truco/shared";
import { MATCHES_PER_GROUP } from "@truco/shared";
import { supabaseAdmin } from "./supabaseClient.js";
import type { Database } from "../types/database.js";
import { EditionSetupError } from "../services/editionSetupError.js";

type TeamRow = Database["public"]["Tables"]["truco_teams"]["Row"];
type MatchRow = Database["public"]["Tables"]["truco_matches"]["Row"];
type BracketRow = Database["public"]["Tables"]["truco_bracket_matches"]["Row"];
type GroupRow = Database["public"]["Tables"]["truco_groups"]["Row"];

function fail(action: string, error: { message: string; code?: string } | null): never {
  if ((error?.code === "PGRST205" || error?.code === "42P01") && error.message.includes("truco_team_memberships")) {
    throw new EditionSetupError("A edição precisa receber a migration 202610050001_manual_edition_participation.sql no Supabase antes de carregar as duplas. Avise o administrador do campeonato.");
  }
  throw new Error(`Falha ao ${action}: ${error?.message ?? "erro desconhecido"}`);
}

function mapMatch(row: MatchRow): Match {
  const result: MatchResult | null = row.sets_a !== null && row.sets_b !== null ? { setsA: row.sets_a, setsB: row.sets_b } : null;
  return {
    id: row.truco_id,
    stage: row.stage,
    round: row.round,
    order: row.match_order,
    groupId: null, // preenchido pelo chamador quando precisa do label (join com truco_groups)
    teamAId: row.truco_team_a_id,
    teamBId: row.truco_team_b_id,
    result,
    status: row.status,
    tableNumber: row.table_number,
    blockNumber: row.block_number,
    queuePosition: row.queue_position,
    championshipId: row.truco_championship_id,
  };
}

function mapBracketSlot(type: BracketRow["slot_a_type"], teamId: string | null, sourceId: string | null): BracketSlotSource {
  if (type === "direct") return { type: "direct", teamId: teamId ?? "" };
  if (type === "winner") return { type: "winner", bracketMatchId: sourceId ?? "" };
  return { type: "tbd" };
}

function mapBracket(row: BracketRow): BracketMatch {
  return {
    id: row.truco_id,
    round: row.round,
    label: row.label,
    order: row.match_order,
    slotA: mapBracketSlot(row.slot_a_type, row.slot_a_team_id, row.slot_a_source_id),
    slotB: mapBracketSlot(row.slot_b_type, row.slot_b_team_id, row.slot_b_source_id),
    matchId: row.truco_match_id,
  };
}

interface TeamMemberJoinRow {
  position: number;
  truco_player_id: string;
}

function mapTeam(row: TeamRow, groupLabel: string | null, memberIds: [string, string]): Team {
  return {
    id: row.truco_id,
    name: row.name,
    player1Id: memberIds[0],
    player2Id: memberIds[1],
    status: row.status,
    seeded: row.seeded,
    isPlaceholder: row.is_placeholder,
    groupId: (groupLabel as GroupId | null) ?? null,
    strength: 3,
  };
}

class TrucoRepository {
  newId(): string {
    return randomUUID();
  }

  // ---------- Campeonato ----------

  async getCurrentChampionship() {
    const { data, error } = await supabaseAdmin
      .from("truco_championships")
      .select("*")
      .eq("status", "em_andamento")
      .order("edition", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) fail("carregar o campeonato atual", error);
    if (!data) throw new Error("Nenhum campeonato em andamento encontrado.");
    return data;
  }

  async setDrawStatus(championshipId: string, status: DrawStatus): Promise<void> {
    const { error } = await supabaseAdmin.from("truco_championships").update({ draw_status: status }).eq("truco_id", championshipId);
    if (error) fail("atualizar o status do sorteio", error);
  }

  async setCurrentPhase(championshipId: string, phase: string): Promise<void> {
    const { error } = await supabaseAdmin.from("truco_championships").update({ current_phase: phase }).eq("truco_id", championshipId);
    if (error) fail("atualizar a fase atual", error);
  }

  // ---------- Jogadores ----------

  async listPlayers(): Promise<Player[]> {
    const { data: players, error } = await supabaseAdmin.from("truco_players").select("truco_id, name, avatar_url");
    if (error) fail("listar jogadores", error);

    // Sem `email` no select: ele é identificador interno do Supabase Auth e não sai daqui.
    const { data: profiles, error: profilesError } = await supabaseAdmin.from("truco_profiles").select("truco_player_id, role");
    if (profilesError) fail("carregar perfis dos jogadores", profilesError);
    const currentChampionship = await this.getCurrentChampionship();
    const { data: members, error: membersError } = await supabaseAdmin.from("truco_team_memberships")
      .select("truco_player_1_id, truco_player_2_id, truco_team_id")
      .eq("truco_championship_id", currentChampionship.truco_id);
    if (membersError) fail("carregar participações dos jogadores", membersError);

    const profileByPlayer = new Map((profiles ?? []).map((p) => [p.truco_player_id, p]));
    const teamByPlayer = new Map<string, string>();
    (members ?? []).forEach((m) => {
      teamByPlayer.set(m.truco_player_1_id, m.truco_team_id);
      teamByPlayer.set(m.truco_player_2_id, m.truco_team_id);
    });

    return (players ?? []).map((player) => {
      const profile = profileByPlayer.get(player.truco_id);
      return {
        id: player.truco_id,
        name: player.name,
        role: (profile?.role as UserRole) ?? "jogador",
        teamId: teamByPlayer.get(player.truco_id) ?? null,
        avatarUrl: player.avatar_url,
      };
    });
  }

  async setPlayerAvatar(playerId: string, avatarUrl: string): Promise<void> {
    const { error } = await supabaseAdmin.from("truco_players").update({ avatar_url: avatarUrl }).eq("truco_id", playerId);
    if (error) fail("salvar a foto de perfil", error);
  }

  /** Time do jogador logado — usado para restringir o que ele pode consultar (ver requireAuth). */
  async getTeamIdForPlayer(playerId: string): Promise<string | null> {
    const championship = await this.getCurrentChampionship();
    const { data, error } = await supabaseAdmin
      .from("truco_team_memberships")
      .select("truco_team_id")
      .eq("truco_championship_id", championship.truco_id)
      .or(`truco_player_1_id.eq.${playerId},truco_player_2_id.eq.${playerId}`)
      .maybeSingle();
    if (error) fail("buscar a dupla do jogador", error);
    return data?.truco_team_id ?? null;
  }

  // ---------- Duplas ----------

  private async teamMemberIdsByTeam(): Promise<Map<string, [string, string]>> {
    const { data, error } = await supabaseAdmin
      .from("truco_team_members")
      .select("truco_team_id, truco_player_id, position")
      .order("position", { ascending: true });
    if (error) fail("carregar integrantes das duplas", error);

    const map = new Map<string, [string, string]>();
    (data as TeamMemberJoinRow[] & { truco_team_id: string }[])?.forEach((row: any) => {
      const pair = map.get(row.truco_team_id) ?? ["", ""];
      pair[row.position - 1] = row.truco_player_id;
      map.set(row.truco_team_id, pair as [string, string]);
    });
    return map;
  }

  private async groupLabelsById(): Promise<Map<string, string>> {
    const { data, error } = await supabaseAdmin.from("truco_groups").select("truco_id, label");
    if (error) fail("carregar grupos", error);
    return new Map((data ?? []).map((g) => [g.truco_id, g.label]));
  }

  async listTeams(championshipId: string): Promise<Team[]> {
    const { data, error } = await supabaseAdmin.from("truco_teams").select("*").eq("truco_championship_id", championshipId);
    if (error) fail("listar duplas", error);

    const [{ data: memberships, error: membershipError }, groups] = await Promise.all([
      supabaseAdmin.from("truco_team_memberships").select("truco_team_id, truco_player_1_id, truco_player_2_id, strength").eq("truco_championship_id", championshipId),
      this.groupLabelsById(),
    ]);
    if (membershipError) fail("carregar participações das duplas", membershipError);
    const groupById = new Map(groups);

    // Grupo: sempre truco_teams.truco_group_id — a mesma coluna da classificação
    // (truco_rpc_standings) e da lista de cada grupo. A cópia em truco_team_memberships
    // é só espelho para as regras de acesso do banco e não é lida aqui.
    return (memberships ?? []).flatMap((membership) => {
      const row = (data ?? []).find((team) => team.truco_id === membership.truco_team_id);
      if (!row) return [];
      const team = mapTeam(row, row.truco_group_id ? (groupById.get(row.truco_group_id) ?? null) : null,
        [membership.truco_player_1_id, membership.truco_player_2_id]);
      return [{ ...team, strength: membership.strength }];
    });
  }

  async getTeam(teamId: string): Promise<Team | undefined> {
    const { data, error } = await supabaseAdmin.from("truco_teams").select("*").eq("truco_id", teamId).maybeSingle();
    if (error) fail("buscar dupla", error);
    if (!data) return undefined;

    const championship = await this.getCurrentChampionship();
    const { data: membership, error: membershipError } = await supabaseAdmin.from("truco_team_memberships")
      .select("truco_player_1_id, truco_player_2_id, strength")
      .eq("truco_championship_id", championship.truco_id).eq("truco_team_id", teamId).maybeSingle();
    if (membershipError) fail("carregar participação da dupla", membershipError);
    if (!membership) return undefined;
    const groups = await this.groupLabelsById();
    const team = mapTeam(data, data.truco_group_id ? (groups.get(data.truco_group_id) ?? null) : null,
      [membership.truco_player_1_id, membership.truco_player_2_id]);
    return { ...team, strength: membership.strength };
  }

  async approvedTeams(championshipId: string): Promise<Team[]> {
    const teams = await this.listTeams(championshipId);
    return teams.filter((t) => t.status === "aprovada");
  }

  async approveTeam(teamId: string): Promise<Team> {
    const { error } = await supabaseAdmin.from("truco_teams").update({ status: "aprovada" }).eq("truco_id", teamId);
    if (error) fail("aprovar dupla", error);
    const team = await this.getTeam(teamId);
    if (!team) throw new Error("Dupla não encontrada após aprovação.");
    return team;
  }

  async setTeamStatus(teamId: string, status: Team["status"]): Promise<void> {
    const { error } = await supabaseAdmin.from("truco_teams").update({ status }).eq("truco_id", teamId);
    if (error) fail("atualizar status da dupla", error);
  }

  async rejectTeam(teamId: string): Promise<void> {
    const { error } = await supabaseAdmin.from("truco_teams").delete().eq("truco_id", teamId);
    if (error) fail("rejeitar dupla", error);
  }

  async renameTeam(teamId: string, name: string): Promise<Team> {
    const { error } = await supabaseAdmin.from("truco_teams").update({ name }).eq("truco_id", teamId);
    if (error) fail("renomear dupla", error);
    const team = await this.getTeam(teamId);
    if (!team) throw new Error("Dupla não encontrada após renomear.");
    return team;
  }

  async createTeamParticipation(input: { championshipId: string; name: string; player1Id: string; player2Id: string; groupId: GroupId; strength: number }): Promise<Team> {
    await this.ensureGroups(input.championshipId);
    const groupRowId = await this.getGroupRowId(input.championshipId, input.groupId);
    const { data: teamId, error } = await supabaseAdmin.rpc("truco_rpc_save_team_participation", {
      p_team_id: null,
      p_championship_id: input.championshipId,
      p_team_name: input.name.trim(),
      p_player_1_id: input.player1Id,
      p_player_2_id: input.player2Id,
      p_group_id: groupRowId,
      p_strength: input.strength,
    });
    if (error || !teamId) fail("criar dupla", error);
    const team = await this.getTeam(teamId);
    if (!team) throw new Error("Dupla não encontrada após criação.");
    return team;
  }

  async updateTeamParticipation(teamId: string, input: { championshipId: string; name: string; player1Id: string; player2Id: string; groupId: GroupId; strength: number }): Promise<Team> {
    const groupRowId = await this.getGroupRowId(input.championshipId, input.groupId);
    const { error } = await supabaseAdmin.rpc("truco_rpc_save_team_participation", {
      p_team_id: teamId,
      p_championship_id: input.championshipId,
      p_team_name: input.name.trim(),
      p_player_1_id: input.player1Id,
      p_player_2_id: input.player2Id,
      p_group_id: groupRowId,
      p_strength: input.strength,
    });
    if (error) fail("atualizar participação da dupla", error);
    const team = await this.getTeam(teamId);
    if (!team) throw new Error("Dupla não encontrada após atualização.");
    return team;
  }

  async createPlayer(name: string): Promise<Player> {
    const { data, error } = await supabaseAdmin.from("truco_players").insert({ name: name.trim() })
      .select("truco_id, name, avatar_url").single();
    if (error) fail("criar jogador", error);
    return { id: data.truco_id, name: data.name, role: "jogador", teamId: null, avatarUrl: data.avatar_url };
  }

  // ---------- Grupos ----------

  async listGroups(championshipId: string): Promise<Group[]> {
    const { data: groups, error } = await supabaseAdmin.from("truco_groups").select("*").eq("truco_championship_id", championshipId);
    if (error) fail("listar grupos", error);

    const { data: teams, error: teamsError } = await supabaseAdmin
      .from("truco_teams")
      .select("truco_id, truco_group_id, status")
      .eq("truco_championship_id", championshipId);
    if (teamsError) fail("listar duplas dos grupos", teamsError);

    return (groups ?? []).map((g: GroupRow) => ({
      id: g.label as GroupId,
      name: g.name,
      teamIds: (teams ?? []).filter((t) => t.status === "aprovada" && t.truco_group_id === g.truco_id).map((t) => t.truco_id),
    }));
  }

  async getGroup(championshipId: string, groupId: GroupId): Promise<Group> {
    const groups = await this.listGroups(championshipId);
    const group = groups.find((g) => g.id === groupId);
    if (!group) throw new Error(`Grupo ${groupId} não encontrado`);
    return group;
  }

  async getGroupRowId(championshipId: string, groupId: GroupId): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from("truco_groups")
      .select("truco_id")
      .eq("truco_championship_id", championshipId)
      .eq("label", groupId)
      .maybeSingle();
    if (error || !data) fail(`localizar o grupo ${groupId}`, error);
    return data!.truco_id;
  }

  async ensureGroups(championshipId: string): Promise<void> {
    const { data } = await supabaseAdmin.from("truco_groups").select("truco_id").eq("truco_championship_id", championshipId);
    if (data && data.length > 0) return;

    const { error } = await supabaseAdmin.from("truco_groups").insert([
      { truco_championship_id: championshipId, label: "A", name: "Grupo A" },
      { truco_championship_id: championshipId, label: "B", name: "Grupo B" },
    ]);
    if (error) fail("criar grupos", error);
  }

  async clearTeamGroups(championshipId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from("truco_teams")
      .update({ truco_group_id: null })
      .eq("truco_championship_id", championshipId);
    if (error) fail("limpar a alocação de grupos", error);
  }

  async assignTeamsToGroups(assignments: Record<GroupId, string[]>, championshipId: string): Promise<void> {
    await this.ensureGroups(championshipId);
    for (const groupId of Object.keys(assignments) as GroupId[]) {
      const groupRowId = await this.getGroupRowId(championshipId, groupId);
      const teamIds = assignments[groupId];
      if (teamIds.length === 0) continue;
      const { error } = await supabaseAdmin.from("truco_teams").update({ truco_group_id: groupRowId }).in("truco_id", teamIds);
      if (error) fail(`alocar duplas no grupo ${groupId}`, error);
    }
  }

  // ---------- Partidas ----------

  async listMatches(championshipId: string, filters: { stage?: string; groupLabel?: string; teamId?: string } = {}): Promise<Match[]> {
    let query = supabaseAdmin.from("truco_matches").select("*").eq("truco_championship_id", championshipId);
    if (filters.stage) query = query.eq("stage", filters.stage as Match["stage"]);
    const { data, error } = await query;
    if (error) fail("listar partidas", error);

    const groups = await this.groupLabelsById();
    let matches = (data ?? []).map((row) => ({
      ...mapMatch(row),
      groupId: row.truco_group_id ? ((groups.get(row.truco_group_id) as GroupId) ?? null) : null,
    }));

    if (filters.groupLabel) matches = matches.filter((m) => m.groupId === filters.groupLabel);
    if (filters.teamId) matches = matches.filter((m) => m.teamAId === filters.teamId || m.teamBId === filters.teamId);

    return matches.sort((a, b) => a.order - b.order);
  }

  async getMatch(matchId: string): Promise<Match | undefined> {
    const { data, error } = await supabaseAdmin.from("truco_matches").select("*").eq("truco_id", matchId).maybeSingle();
    if (error) fail("buscar partida", error);
    if (!data) return undefined;
    const groups = await this.groupLabelsById();
    return { ...mapMatch(data), groupId: data.truco_group_id ? ((groups.get(data.truco_group_id) as GroupId) ?? null) : null };
  }

  async getMatchPlayerIds(championshipId: string, teamAId: string, teamBId: string): Promise<{ playerIds: string[] }> {
    const { data, error } = await supabaseAdmin.from("truco_team_memberships")
      .select("truco_team_id, truco_player_1_id, truco_player_2_id")
      .eq("truco_championship_id", championshipId)
      .in("truco_team_id", [teamAId, teamBId]);
    if (error) fail("validar integrantes da partida", error);
    const membershipA = data?.find((row) => row.truco_team_id === teamAId);
    const membershipB = data?.find((row) => row.truco_team_id === teamBId);
    if (!membershipA || !membershipB) return { playerIds: [] };
    return { playerIds: [membershipA.truco_player_1_id, membershipA.truco_player_2_id, membershipB.truco_player_1_id, membershipB.truco_player_2_id] };
  }

  async createGroupMatches(
    championshipId: string,
    groupId: GroupId,
    pairs: Array<{ teamAId: string; teamBId: string; order: number }>,
  ): Promise<void> {
    const groupRowId = await this.getGroupRowId(championshipId, groupId);
    const rows = pairs.map((pair) => ({
      truco_id: this.newId(),
      truco_championship_id: championshipId,
      stage: "grupos" as const,
      round: `Grupo ${groupId}`,
      match_order: pair.order,
      truco_group_id: groupRowId,
      truco_team_a_id: pair.teamAId,
      truco_team_b_id: pair.teamBId,
      status: "pendente" as const,
    }));
    if (rows.length === 0) return;
    const { error } = await supabaseAdmin.from("truco_matches").insert(rows);
    if (error) fail("criar as partidas da fase de grupos", error);
  }

  /** Muda só a ordem de jogos ainda pendentes; o filtro por status protege os já realizados. */
  async setPendingMatchOrders(items: Array<{ matchId: string; order: number }>): Promise<void> {
    for (const item of items) {
      const { error } = await supabaseAdmin.from("truco_matches").update({ match_order: item.order })
        .eq("truco_id", item.matchId).eq("status", "pendente");
      if (error) fail("reordenar os jogos pendentes do grupo", error);
    }
  }

  async createAllGroupMatches(championshipId: string, fixtures: Record<GroupId, Array<{ teamAId: string; teamBId: string; order: number }>>): Promise<void> {
    if (fixtures.A.length !== MATCHES_PER_GROUP || fixtures.B.length !== MATCHES_PER_GROUP) throw new RangeError(`A edição deve gerar ${MATCHES_PER_GROUP} partidas por grupo.`);
    await this.ensureGroups(championshipId);
    const groupIds = new Map<GroupId, string>([
      ["A", await this.getGroupRowId(championshipId, "A")],
      ["B", await this.getGroupRowId(championshipId, "B")],
    ]);
    const rows = (["A", "B"] as const).flatMap((groupId) => fixtures[groupId].map((pair) => ({
      truco_id: this.newId(),
      truco_championship_id: championshipId,
      stage: "grupos" as const,
      round: `Grupo ${groupId}`,
      match_order: pair.order,
      truco_group_id: groupIds.get(groupId)!,
      truco_team_a_id: pair.teamAId,
      truco_team_b_id: pair.teamBId,
      status: "pendente" as const,
    })));
    const { error } = await supabaseAdmin.from("truco_matches").insert(rows);
    if (error) fail("criar partidas da fase de grupos", error);
  }

  async createMatch(input: {
    championshipId: string;
    stage: Match["stage"];
    round: string;
    order: number;
    teamAId: string;
    teamBId: string;
  }): Promise<Match> {
    const id = this.newId();
    const { error } = await supabaseAdmin.from("truco_matches").insert({
      truco_id: id,
      truco_championship_id: input.championshipId,
      stage: input.stage,
      round: input.round,
      match_order: input.order,
      truco_team_a_id: input.teamAId,
      truco_team_b_id: input.teamBId,
      status: "pendente",
    });
    if (error) fail("criar partida", error);
    const match = await this.getMatch(id);
    if (!match) throw new Error("Partida não encontrada após criação.");
    return match;
  }

  async listMatchResultAudit(championshipId: string): Promise<Array<{ id: string; matchId: string | null; actorId: string | null; action: string; createdAt: string; metadata: unknown }>> {
    const { data, error } = await supabaseAdmin.from("truco_audit_log")
      .select("truco_id, entity_id, truco_actor_id, action, created_at, metadata")
      .eq("entity", "match_result")
      .eq("truco_championship_id", championshipId)
      .order("created_at", { ascending: false });
    if (error) fail("consultar alterações de resultados", error);
    const profiles = await supabaseAdmin.from("truco_profiles").select("truco_id, truco_player_id");
    const players = await supabaseAdmin.from("truco_players").select("truco_id, name");
    const playerById = new Map((players.data ?? []).map((player) => [player.truco_id, player.name]));
    const nameByActor = new Map((profiles.data ?? []).map((profile) => [profile.truco_id, playerById.get(profile.truco_player_id) ?? "Conta removida"]));
    return (data ?? []).map((row) => ({
      id: row.truco_id,
      matchId: row.entity_id,
      actorId: row.truco_actor_id,
      actorName: row.truco_actor_id ? nameByActor.get(row.truco_actor_id) ?? "Conta desconhecida" : "Sistema",
      action: row.action,
      createdAt: row.created_at,
      metadata: row.metadata,
    }));
  }

  async saveMatchResult(input: { championshipId: string; matchId: string; result: MatchResult; actorId: string }): Promise<void> {
    const { error } = await supabaseAdmin.rpc("truco_rpc_record_match_result", {
      p_championship_id: input.championshipId,
      p_match_id: input.matchId,
      p_sets_a: input.result.setsA,
      p_sets_b: input.result.setsB,
      p_actor_id: input.actorId,
    });
    if (error) fail("salvar resultado e auditoria", error);
  }

  /** Grava mesa/bloco/posição na fila calculados pelo escalonador (schedulerService). */
  async applyScheduleAssignments(
    assignments: Array<{ matchId: string; tableNumber: number; blockNumber: number; queuePosition: number }>,
  ): Promise<void> {
    for (const assignment of assignments) {
      const { error } = await supabaseAdmin
        .from("truco_matches")
        .update({
          table_number: assignment.tableNumber,
          block_number: assignment.blockNumber,
          queue_position: assignment.queuePosition,
        })
        .eq("truco_id", assignment.matchId);
      if (error) fail("gravar a escala de mesas", error);
    }
  }

  /** Atribuição manual de mesa/ordem para uma partida específica (ajuste do admin). */
  async setMatchSchedule(
    matchId: string,
    patch: { tableNumber?: number | null; queuePosition?: number | null },
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from("truco_matches")
      .update({
        ...(patch.tableNumber !== undefined ? { table_number: patch.tableNumber } : {}),
        ...(patch.queuePosition !== undefined ? { queue_position: patch.queuePosition } : {}),
      })
      .eq("truco_id", matchId);
    if (error) fail("ajustar a escala da partida", error);
  }

  async clearMatchesAndBracket(championshipId: string): Promise<void> {
    const { error: bracketError } = await supabaseAdmin.from("truco_bracket_matches").delete().eq("truco_championship_id", championshipId);
    if (bracketError) fail("limpar o mata-mata", bracketError);
    const { error: matchError } = await supabaseAdmin.from("truco_matches").delete().eq("truco_championship_id", championshipId);
    if (matchError) fail("limpar as partidas", matchError);
  }

  // ---------- Mata-mata ----------

  async listBracketMatches(championshipId: string): Promise<BracketMatch[]> {
    const { data, error } = await supabaseAdmin.from("truco_bracket_matches").select("*").eq("truco_championship_id", championshipId);
    if (error) fail("listar o mata-mata", error);
    return (data ?? []).map(mapBracket).sort((a, b) => a.order - b.order);
  }

  async createBracketMatches(
    championshipId: string,
    rows: Array<{
      id: string;
      round: BracketMatch["round"];
      label: string;
      order: number;
      slotA: BracketSlotSource;
      slotB: BracketSlotSource;
    }>,
  ): Promise<void> {
    const toColumns = (slot: BracketSlotSource) => ({
      type: slot.type,
      teamId: slot.type === "direct" ? slot.teamId : null,
      sourceId: slot.type === "winner" ? slot.bracketMatchId : null,
    });

    const payload = rows.map((row) => {
      const a = toColumns(row.slotA);
      const b = toColumns(row.slotB);
      return {
        truco_id: row.id,
        truco_championship_id: championshipId,
        round: row.round,
        label: row.label,
        match_order: row.order,
        slot_a_type: a.type,
        slot_a_team_id: a.teamId,
        slot_a_source_id: a.sourceId,
        slot_b_type: b.type,
        slot_b_team_id: b.teamId,
        slot_b_source_id: b.sourceId,
      };
    });

    const { error } = await supabaseAdmin.from("truco_bracket_matches").insert(payload);
    if (error) fail("criar o mata-mata", error);
  }

  async linkBracketMatch(bracketMatchId: string, matchId: string): Promise<void> {
    const { error } = await supabaseAdmin.from("truco_bracket_matches").update({ truco_match_id: matchId }).eq("truco_id", bracketMatchId);
    if (error) fail("vincular a partida ao mata-mata", error);
  }

  // ---------- Histórico ----------

  async listHistory(): Promise<HistoryEntry[]> {
    const { data, error } = await supabaseAdmin
      .from("truco_history")
      .select(
        `truco_id, edition, name, year, final_result, notes,
         champion:truco_teams!truco_history_champion_team_id_fkey(truco_id),
         runner_up:truco_teams!truco_history_runner_up_team_id_fkey(truco_id)`,
      )
      .order("edition", { ascending: true });
    if (error) fail("listar o histórico", error);

    const members = await this.teamMemberIdsByTeam();
    const players = await this.listPlayers();
    const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "—";

    return (data ?? []).map((row: any) => {
      const championIds = row.champion ? members.get(row.champion.truco_id) : null;
      const runnerUpIds = row.runner_up ? members.get(row.runner_up.truco_id) : null;
      return {
        id: row.truco_id,
        edition: row.edition,
        name: row.name,
        year: row.year,
        champions: championIds ? [nameOf(championIds[0]), nameOf(championIds[1])] : ["—", "—"],
        runnersUp: runnerUpIds ? [nameOf(runnerUpIds[0]), nameOf(runnerUpIds[1])] : null,
        finalResult: row.final_result,
        notes: row.notes,
      } satisfies HistoryEntry;
    });
  }

  async addHistoryEntry(entry: {
    championshipId: string;
    edition: number;
    name: string;
    year: number;
    championTeamId: string;
    runnerUpTeamId: string;
    finalResult: string;
    notes: string;
  }): Promise<void> {
    const { error } = await supabaseAdmin.from("truco_history").insert({
      truco_championship_id: entry.championshipId,
      edition: entry.edition,
      name: entry.name,
      year: entry.year,
      champion_team_id: entry.championTeamId,
      runner_up_team_id: entry.runnerUpTeamId,
      final_result: entry.finalResult,
      notes: entry.notes,
    });
    if (error) fail("registrar a edição no histórico", error);
  }

  async countHistoryEntries(): Promise<number> {
    const { count, error } = await supabaseAdmin.from("truco_history").select("truco_id", { count: "exact", head: true });
    if (error) fail("contar edições do histórico", error);
    return count ?? 0;
  }

  // ---------- Ranking (derivado — nunca armazenado solto) ----------

  async listRanking(): Promise<RankingEntry[]> {
    const players = await this.listPlayers();
    const titles = new Map<string, number>();

    const members = await this.teamMemberIdsByTeam();
    const { data: historyRows } = await supabaseAdmin.from("truco_history").select("champion_team_id");
    (historyRows ?? []).forEach((row) => {
      if (!row.champion_team_id) return;
      const pair = members.get(row.champion_team_id);
      pair?.forEach((playerId) => titles.set(playerId, (titles.get(playerId) ?? 0) + 1));
    });

    return players
      .map((player) => ({ playerId: player.id, playerName: player.name, titles: titles.get(player.id) ?? 0 }))
      .sort((a, b) => b.titles - a.titles || a.playerName.localeCompare(b.playerName));
  }
}

export const store = new TrucoRepository();
