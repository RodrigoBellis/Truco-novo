import { supabaseAdmin } from "../data/supabaseClient.js";
import { buildMajorChampions, type MajorChampionEntry } from "@truco/shared";

export type { MajorChampionEntry } from "@truco/shared";

interface TeamRow {
  truco_id: string;
  status: string;
  is_placeholder: boolean;
}

interface MemberRow {
  truco_team_id: string;
  truco_player_id: string;
  position: number;
}

interface MembershipRow {
  truco_team_id: string;
  truco_player_1_id: string;
  truco_player_2_id: string;
}

interface PlayerRow {
  truco_id: string;
  name: string;
}

interface HistoryRow {
  champion_team_id: string | null;
  edition: number;
}

function missingMembershipTable(error: { code?: string; message: string }): boolean {
  return (error.code === "PGRST205" || error.code === "42P01") && error.message.includes("truco_team_memberships");
}

/** Lê somente nomes, participações históricas e campeões; sem expor e-mails ou dados de conta. */
export async function getMajorChampions(): Promise<MajorChampionEntry[]> {
  const [teamsResult, membersResult, membershipsResult, playersResult, historyResult] = await Promise.all([
    supabaseAdmin.from("truco_teams").select("truco_id, status, is_placeholder").returns<TeamRow[]>(),
    supabaseAdmin.from("truco_team_members").select("truco_team_id, truco_player_id, position").returns<MemberRow[]>(),
    supabaseAdmin.from("truco_team_memberships").select("truco_team_id, truco_player_1_id, truco_player_2_id").returns<MembershipRow[]>(),
    supabaseAdmin.from("truco_players").select("truco_id, name").returns<PlayerRow[]>(),
    supabaseAdmin.from("truco_history").select("champion_team_id, edition").returns<HistoryRow[]>(),
  ]);

  for (const [action, error] of [
    ["duplas", teamsResult.error],
    ["integrantes das duplas", membersResult.error],
    ["jogadores", playersResult.error],
    ["histórico de campeões", historyResult.error],
  ] as const) {
    if (error) throw new Error(`Não foi possível carregar ${action}: ${error.message}`);
  }

  if (membershipsResult.error && !missingMembershipTable(membershipsResult.error)) {
    throw new Error(`Não foi possível carregar as participações históricas: ${membershipsResult.error.message}`);
  }

  const teams = teamsResult.data ?? [];
  const historicalTitles = (historyResult.data ?? []).map((row) => ({ teamId: row.champion_team_id, edition: row.edition }));
  const championTeamIds = new Set(historicalTitles.flatMap((title) => title.teamId ? [title.teamId] : []));
  const eligibleTeamIds = new Set(teams
    .filter((team) => !team.is_placeholder && (team.status === "aprovada" || championTeamIds.has(team.truco_id)))
    .map((team) => team.truco_id));
  const namesByPlayer = new Map((playersResult.data ?? []).map((player) => [player.truco_id, player.name]));
  const pairByTeam = new Map<string, [string, string]>();
  const legacyMembersByTeam = new Map<string, MemberRow[]>();

  for (const member of membersResult.data ?? []) {
    if (!eligibleTeamIds.has(member.truco_team_id)) continue;
    const rows = legacyMembersByTeam.get(member.truco_team_id) ?? [];
    rows.push(member);
    legacyMembersByTeam.set(member.truco_team_id, rows);
  }
  for (const [teamId, members] of legacyMembersByTeam) {
    const ordered = [...members].sort((a, b) => a.position - b.position);
    const first = ordered.find((member) => member.position === 1);
    const second = ordered.find((member) => member.position === 2);
    if (first && second && first.truco_player_id !== second.truco_player_id) {
      pairByTeam.set(teamId, [first.truco_player_id, second.truco_player_id]);
    }
  }

  // A edição atual e edições futuras usam a tabela de participações por edição.
  for (const membership of membershipsResult.data ?? []) {
    if (!eligibleTeamIds.has(membership.truco_team_id) || membership.truco_player_1_id === membership.truco_player_2_id) continue;
    pairByTeam.set(membership.truco_team_id, [membership.truco_player_1_id, membership.truco_player_2_id]);
  }

  const teamPairs = [...pairByTeam].flatMap(([teamId, [player1Id, player2Id]]) => {
    const player1Name = namesByPlayer.get(player1Id);
    const player2Name = namesByPlayer.get(player2Id);
    if (!player1Name || !player2Name) return [];
    return [{ teamId, player1Id, player1Name, player2Id, player2Name }];
  });

  return buildMajorChampions(teamPairs, historicalTitles);
}
