/**
 * Retrato sanitizado da 5ª edição como estava no banco em 07/10/2026 — só para testes
 * automatizados. Nomes de duplas e placares são os reais; ids foram trocados por códigos
 * neutros e não há e-mail, conta nem credencial. A classificação é a que truco_rpc_standings
 * devolvia naquele dia (Vito & Luizão e Xablauu & Alexandre empatados em tudo: a ordem entre
 * os dois é a do banco, pois o critério para empate exato ainda não foi definido).
 */
type GroupId = "A" | "B";

const DUPLAS: Array<[id: string, player1: string, player2: string, groupId: GroupId, seeded: boolean]> = [
  ["t-bagriel", "Bagriel", "Diguinho", "A", true],
  ["t-bitula", "Bitula", "Galão", "A", false],
  ["t-pg", "PG", "Caio", "A", false],
  ["t-vito", "Vito", "Luizão", "A", false],
  ["t-xablauu", "Xablauu", "Alexandre", "A", false],
  ["t-jp", "JP", "Davi", "B", false],
  ["t-rafael", "Rafael", "Pigas", "B", false],
  ["t-rogerio", "Rogério", "Waguinho", "B", false],
  ["t-ronaldo", "Ronaldo", "Rodrigo", "B", true],
  ["t-vitor", "Vitor", "Fernando", "B", false],
];

const slug = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const snapshotPlayers = DUPLAS.flatMap(([teamId, first, second]) => [first, second].map((name) => ({
  id: `p-${slug(name)}`, name, role: "jogador", teamId, avatarUrl: null,
})));

export const snapshotTeams = DUPLAS.map(([id, first, second, groupId, seeded]) => ({
  id, name: `${first} & ${second}`, player1Id: `p-${slug(first)}`, player2Id: `p-${slug(second)}`,
  status: "aprovada", seeded, isPlaceholder: false, groupId, strength: 3,
}));

export const snapshotGroups = (["A", "B"] as const).map((groupId) => ({
  id: groupId, name: `Grupo ${groupId}`, teamIds: snapshotTeams.filter((team) => team.groupId === groupId).map((team) => team.id),
}));

// [grupo, ordem, dupla A, dupla B, placar, posição na fila]
const JOGOS: Array<[GroupId, number, string, string, [number, number] | null, number]> = [
  ["A", 0, "t-bagriel", "t-xablauu", [2, 1], 1], ["A", 1, "t-bagriel", "t-vito", [2, 1], 4],
  ["A", 2, "t-bagriel", "t-pg", [1, 2], 10], ["A", 3, "t-bagriel", "t-bitula", [2, 0], 9],
  ["A", 4, "t-xablauu", "t-vito", null, 13], ["A", 5, "t-xablauu", "t-pg", null, 7], ["A", 6, "t-xablauu", "t-bitula", null, 16],
  ["A", 7, "t-vito", "t-pg", null, 3], ["A", 8, "t-vito", "t-bitula", null, 19], ["A", 9, "t-pg", "t-bitula", null, 15],
  ["B", 0, "t-vitor", "t-jp", null, 2], ["B", 1, "t-vitor", "t-rafael", null, 8], ["B", 2, "t-vitor", "t-rogerio", null, 14],
  ["B", 3, "t-vitor", "t-ronaldo", null, 6], ["B", 4, "t-jp", "t-rafael", null, 17], ["B", 5, "t-jp", "t-rogerio", null, 11],
  ["B", 6, "t-jp", "t-ronaldo", null, 20], ["B", 7, "t-rafael", "t-rogerio", null, 5], ["B", 8, "t-rafael", "t-ronaldo", null, 12],
  ["B", 9, "t-rogerio", "t-ronaldo", null, 18],
];

export const snapshotMatches = JOGOS.map(([groupId, order, teamAId, teamBId, result, queuePosition]) => ({
  id: `m-${groupId}-${order}`, championshipId: "edicao-5", stage: "grupos", round: `Grupo ${groupId}`, order, groupId, teamAId, teamBId,
  result: result ? { setsA: result[0], setsB: result[1] } : null, status: result ? "realizado" : "pendente",
  tableNumber: null, blockNumber: null, queuePosition,
}));

const row = (position: number, teamId: string, jogos: number, vitorias: number, derrotas: number, pontos: number, saldoSets: number) =>
  ({ position, teamId, jogos, vitorias, derrotas, pontos, saldoSets });

export const snapshotStandings: Record<GroupId, ReturnType<typeof row>[]> = {
  A: [row(1, "t-bagriel", 4, 3, 1, 8, 3), row(2, "t-pg", 1, 1, 0, 2, 1), row(3, "t-vito", 1, 0, 1, 1, -1), row(4, "t-xablauu", 1, 0, 1, 1, -1), row(5, "t-bitula", 1, 0, 1, 0, -2)],
  B: [row(1, "t-ronaldo", 0, 0, 0, 0, 0), row(2, "t-rafael", 0, 0, 0, 0, 0), row(3, "t-vitor", 0, 0, 0, 0, 0), row(4, "t-rogerio", 0, 0, 0, 0, 0), row(5, "t-jp", 0, 0, 0, 0, 0)],
};
