import type { GroupId, StandingRow } from "@truco/shared";
import { store } from "../data/store.js";
import { supabaseAdmin } from "../data/supabaseClient.js";

/** Delega o cálculo (pontos 3/2/1/0, saldo de sets, vitórias) para truco_rpc_standings —
 * a mesma regra já validada em SQL, com suporte a desempate manual (truco_standings_overrides). */
export async function computeStandings(championshipId: string, groupId: GroupId): Promise<StandingRow[]> {
  const groupRowId = await store.getGroupRowId(championshipId, groupId);
  const { data, error } = await supabaseAdmin.rpc("truco_rpc_standings", {
    p_championship_id: championshipId,
    p_group_id: groupRowId,
  });
  if (error) throw new Error(`Falha ao calcular a classificação: ${error.message}`);

  return (data ?? []).map((row) => ({
    position: row.team_position,
    teamId: row.team_id,
    jogos: row.jogos,
    vitorias: row.vitorias,
    derrotas: row.derrotas,
    pontos: row.pontos,
    saldoSets: row.saldo_sets,
  }));
}

export async function isGroupComplete(championshipId: string, groupId: GroupId): Promise<boolean> {
  const group = await store.getGroup(championshipId, groupId);
  if (group.teamIds.length === 0) return false;
  const matches = await store.listMatches(championshipId, { stage: "grupos", groupLabel: groupId });
  return matches.length > 0 && matches.every((m) => m.status === "realizado");
}
