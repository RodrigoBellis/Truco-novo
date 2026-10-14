/**
 * Participantes OFICIAIS da 5ª edição (lista de 14/10/2026: 7 duplas, grupo único) — só para
 * testes automatizados. Nomes de jogadores e duplas são os reais; ids são códigos neutros e não
 * há e-mail, conta nem credencial. Os três placares abaixo são FICTÍCIOS: servem só para cada
 * dupla ter números diferentes e um teste perceber se uma tela mostra a linha de outra conta.
 * Digão (pai do Diguinho) e Diguinho são pessoas diferentes; Rafinha é o antigo "Rafael".
 */
type GroupId = "A";

const DUPLAS: Array<[id: string, player1: string, player2: string, strength: number]> = [
  ["t-pigas", "Pigas", "Diguinho", 4],
  ["t-ronaldo", "Ronaldo", "Rodrigo", 5],
  ["t-jp", "JP", "Anderson", 3],
  ["t-saulo", "Saulo", "Vitor", 3],
  ["t-pg", "PG", "Alexandre", 2],
  ["t-rogerio", "Rogério", "Waguinho", 2],
  ["t-digao", "Digão", "Rafinha", 2],
];

const slug = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const snapshotPlayers = DUPLAS.flatMap(([teamId, first, second]) => [first, second].map((name) => ({
  id: `p-${slug(name)}`, name, role: "jogador", teamId, avatarUrl: null,
})));

export const snapshotTeams = DUPLAS.map(([id, first, second, strength]) => ({
  id, name: `${first} & ${second}`, player1Id: `p-${slug(first)}`, player2Id: `p-${slug(second)}`,
  status: "aprovada", seeded: false, isPlaceholder: false, groupId: "A" as GroupId, strength,
}));

export const snapshotGroups = [{ id: "A", name: "Grupo Único", teamIds: snapshotTeams.map((team) => team.id) }];

// Os 21 confrontos do grupo único; placares fictícios em três deles.
const RESULTS: Record<string, [number, number]> = {
  "t-pigas|t-digao": [2, 1],
  "t-pigas|t-ronaldo": [2, 0],
  "t-pg|t-digao": [0, 2],
};
const pairs = DUPLAS.flatMap(([a], i) => DUPLAS.slice(i + 1).map(([b]) => [a, b] as const));

export const snapshotMatches = pairs.map(([teamAId, teamBId], order) => {
  const result = RESULTS[`${teamAId}|${teamBId}`] ?? null;
  return {
    id: `m-A-${order}`, championshipId: "edicao-5", stage: "grupos", round: "Grupo A", order, groupId: "A" as GroupId, teamAId, teamBId,
    result: result ? { setsA: result[0], setsB: result[1] } : null, status: result ? "realizado" : "pendente",
    tableNumber: null, blockNumber: null, queuePosition: order + 1,
  };
});

const row = (position: number, teamId: string, jogos: number, vitorias: number, derrotas: number, pontos: number, saldoSets: number, vitorias2x0 = 0) =>
  ({ position, teamId, jogos, vitorias, vitorias2x0, derrotas, pontos, saldoSets, confrontoDireto: 0, tiePending: false });

export const snapshotStandings: Record<GroupId, ReturnType<typeof row>[]> = {
  A: [
    row(1, "t-pigas", 2, 2, 0, 5, 3, 1), row(2, "t-digao", 2, 1, 1, 4, 1, 1), row(3, "t-jp", 0, 0, 0, 0, 0), row(4, "t-saulo", 0, 0, 0, 0, 0),
    row(5, "t-rogerio", 0, 0, 0, 0, 0), row(6, "t-pg", 1, 0, 1, 0, -2), row(7, "t-ronaldo", 1, 0, 1, 0, -2),
  ],
};
