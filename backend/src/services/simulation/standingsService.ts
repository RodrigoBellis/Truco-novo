import { computeGroupStandings, type GroupId, type StandingRow } from "@truco/shared";
import { store } from "../../data/simulationStore.js";

/** Mesma regra do campeonato real (@truco/shared), aplicada aos dados isolados do simulador. */
export function computeStandings(groupId: GroupId): StandingRow[] {
  const group = store.getGroup(groupId);
  const groupMatches = store.matches.filter((m) => m.groupId === groupId && m.stage === "grupos");
  return computeGroupStandings(group.teamIds, groupMatches, store.standingOverrides[groupId]);
}

export function isGroupComplete(groupId: GroupId): boolean {
  const group = store.getGroup(groupId);
  return store.matches
    .filter((m) => m.groupId === groupId && m.stage === "grupos")
    .every((m) => m.status === "realizado") && group.teamIds.length > 0;
}
