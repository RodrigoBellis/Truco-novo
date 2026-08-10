import type { GroupId, StandingRow } from "@truco/shared";
import { pointsForResult } from "@truco/shared";
import { store } from "../../data/simulationStore.js";

export function computeStandings(groupId: GroupId): StandingRow[] {
  const group = store.getGroup(groupId);
  const rows = new Map<string, StandingRow>();

  group.teamIds.forEach((teamId) => {
    rows.set(teamId, { position: 0, teamId, jogos: 0, vitorias: 0, derrotas: 0, pontos: 0, saldoSets: 0 });
  });

  const groupMatches = store.matches.filter((m) => m.groupId === groupId && m.stage === "grupos" && m.result);

  groupMatches.forEach((match) => {
    const result = match.result!;
    const rowA = rows.get(match.teamAId);
    const rowB = rows.get(match.teamBId);
    if (!rowA || !rowB) return;

    const teamAWon = result.setsA > result.setsB;

    rowA.jogos += 1;
    rowB.jogos += 1;
    rowA.pontos += pointsForResult(result, true);
    rowB.pontos += pointsForResult(result, false);
    rowA.saldoSets += result.setsA - result.setsB;
    rowB.saldoSets += result.setsB - result.setsA;

    if (teamAWon) {
      rowA.vitorias += 1;
      rowB.derrotas += 1;
    } else {
      rowB.vitorias += 1;
      rowA.derrotas += 1;
    }
  });

  const sorted = [...rows.values()].sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    if (b.saldoSets !== a.saldoSets) return b.saldoSets - a.saldoSets;
    return b.vitorias - a.vitorias;
  });

  sorted.forEach((row, index) => {
    row.position = index + 1;
  });

  return sorted;
}

export function isGroupComplete(groupId: GroupId): boolean {
  const group = store.getGroup(groupId);
  return store.matches
    .filter((m) => m.groupId === groupId && m.stage === "grupos")
    .every((m) => m.status === "realizado") && group.teamIds.length > 0;
}
