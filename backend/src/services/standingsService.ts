import { computeGroupStandings, type GroupId, type StandingRow } from "@truco/shared";
import { store } from "../data/store.js";

/**
 * Classificação de um grupo pela regra única de @truco/shared: pontos 3/2/1/0, vitórias,
 * vitórias por 2x0, confronto direto e saldo de quedas. Empate que sobreviva aos cinco usa a
 * decisão manual do administrador registrada em truco_standings_overrides; sem decisão, fica
 * pendente.
 *
 * O cálculo não é delegado a truco_rpc_standings: aquela função do banco usa outra ordem de
 * critérios (saldo antes das vitórias, sem 2x0 nem confronto direto).
 */
export async function computeStandings(championshipId: string, groupId: GroupId): Promise<StandingRow[]> {
  const [group, groupRowId, matches] = await Promise.all([
    store.getGroup(championshipId, groupId),
    store.getGroupRowId(championshipId, groupId),
    store.listMatches(championshipId, { stage: "grupos", groupLabel: groupId }),
  ]);
  const overrides = await store.listStandingOverrides(championshipId, groupRowId);
  return computeGroupStandings(group.teamIds, matches, overrides);
}

export async function isGroupComplete(championshipId: string, groupId: GroupId): Promise<boolean> {
  const group = await store.getGroup(championshipId, groupId);
  if (group.teamIds.length === 0) return false;
  const matches = await store.listMatches(championshipId, { stage: "grupos", groupLabel: groupId });
  return matches.length > 0 && matches.every((m) => m.status === "realizado");
}
