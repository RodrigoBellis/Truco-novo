import test from "node:test";
import assert from "node:assert/strict";
import { buildMajorChampions, resolveRankingPairs, type HistoricalTeamTitle, type MajorChampionTeamPair } from "@truco/shared";

const pairs: MajorChampionTeamPair[] = [
  { teamId: "team-1-ed-1", player1Id: "bagei", player1Name: "Bagei", player2Id: "diguinho", player2Name: "Diguinho" },
  { teamId: "team-1-ed-4", player1Id: "diguinho", player1Name: "Diguinho", player2Id: "bagei", player2Name: "Bagei" },
  { teamId: "team-2-ed-3", player1Id: "ronaldo", player1Name: "Ronaldo", player2Id: "rodrigo", player2Name: "Rodrigo" },
  { teamId: "team-3-ed-3", player1Id: "bitula", player1Name: "Bitula", player2Id: "vinicius", player2Name: "Vinícius" },
  { teamId: "team-different-partner", player1Id: "bagei", player1Name: "Bagei", player2Id: "joao", player2Name: "João" },
];

const titles: HistoricalTeamTitle[] = [
  { teamId: "team-1-ed-1", edition: 1 },
  { teamId: "team-1-ed-4", edition: 4 },
  { teamId: "team-2-ed-3", edition: 3 },
  { teamId: "team-3-ed-3", edition: 3 },
  { teamId: "unknown-team", edition: 2 },
  { teamId: null, edition: 5 },
];

test("combinação exata ganha dois títulos mesmo com a ordem dos jogadores invertida", () => {
  const result = buildMajorChampions(pairs, titles);
  assert.equal(result.find((entry) => entry.key.includes("bagei") && entry.key.includes("diguinho"))?.titles, 2);
  assert.deepEqual(result[0].editions, [1, 4]);
});

test("parceiro diferente é outra dupla e recebe somente seus próprios títulos", () => {
  const result = buildMajorChampions(pairs, titles);
  const withDiguinho = result.find((entry) => entry.name === "Bagei & Diguinho");
  const withJoao = result.find((entry) => entry.name === "Bagei & João");
  assert.equal(withDiguinho?.titles, 2);
  assert.equal(withJoao?.titles, 0);
  assert.notEqual(withDiguinho?.key, withJoao?.key);
});

test("ordena títulos e mantém as duplas empatadas na mesma posição", () => {
  const result = buildMajorChampions(pairs, titles);
  assert.equal(result[0].titles, 2);
  assert.equal(result[0].rank, 1);
  const tied = result.filter((entry) => entry.titles === 1);
  assert.equal(tied.length, 2);
  assert.deepEqual(tied.map((entry) => entry.rank), [2, 2]);
  assert.deepEqual(tied.map((entry) => entry.name), ["Bitula & Vinícius", "Rodrigo & Ronaldo"]);
});

test("duplas sem títulos aparecem com zero e os dados novos recalculam o total", () => {
  const first = buildMajorChampions(pairs, titles);
  assert.equal(first.find((entry) => entry.name === "Bagei & João")?.titles, 0);

  const afterNextEdition = buildMajorChampions(pairs, [...titles, { teamId: "team-1-ed-4", edition: 5 }]);
  assert.equal(afterNextEdition.find((entry) => entry.name === "Bagei & Diguinho")?.titles, 3);
});

test("não inventa títulos para registros sem dupla conhecida e não duplica a mesma edição", () => {
  const result = buildMajorChampions(pairs, [...titles, { teamId: "team-1-ed-4", edition: 4 }]);
  assert.equal(result.reduce((sum, entry) => sum + entry.titles, 0), 4);
  assert.equal(result.some((entry) => entry.name === "Dupla desconhecida"), false);
});

test("sem duplas ou histórico retorna uma lista vazia para o estado amigável da página", () => {
  assert.deepEqual(buildMajorChampions([], []), []);
  const zeroTitles = buildMajorChampions(pairs, []);
  assert.equal(zeroTitles.length, 4);
  assert.ok(zeroTitles.every((entry) => entry.titles === 0 && entry.editions.length === 0 && entry.rank === 1));
});

test("trocar os integrantes de uma dupla campeã na edição atual não transfere os títulos antigos", () => {
  const name = (id: string) => id[0].toUpperCase() + id.slice(1);
  const withNames = (rows: ReturnType<typeof resolveRankingPairs>): MajorChampionTeamPair[] => rows.map((row) => ({ ...row, player1Name: name(row.player1Id), player2Name: name(row.player2Id) }));
  const legacy = [
    { teamId: "team-campea", player1Id: "bagriel", player2Id: "diguinho" },
    { teamId: "team-comum", player1Id: "vito", player2Id: "luizao" },
  ];
  const titles: HistoricalTeamTitle[] = [{ teamId: "team-campea", edition: 1 }, { teamId: "team-campea", edition: 2 }];
  const champions = new Set(["team-campea"]);

  // Mesmo par na edição atual (ordem trocada): nada muda.
  const same = buildMajorChampions(withNames(resolveRankingPairs(legacy, [{ teamId: "team-campea", player1Id: "diguinho", player2Id: "bagriel" }], champions)), titles);
  assert.deepEqual(same.map((entry) => [entry.name, entry.titles]), [["Bagriel & Diguinho", 2], ["Luizao & Vito", 0]]);

  // A linha da dupla campeã recebe outro par na edição atual: os títulos ficam com o par histórico.
  const swapped = buildMajorChampions(withNames(resolveRankingPairs(legacy, [{ teamId: "team-campea", player1Id: "bagriel", player2Id: "rafael" }], champions)), titles);
  assert.deepEqual(swapped.map((entry) => [entry.name, entry.titles, entry.editions]), [["Bagriel & Diguinho", 2, [1, 2]], ["Bagriel & Rafael", 0, []], ["Luizao & Vito", 0, []]]);

  // Dupla sem título pode ter o par atualizado normalmente pela participação da edição.
  const common = resolveRankingPairs(legacy, [{ teamId: "team-comum", player1Id: "vito", player2Id: "pigas" }], champions);
  assert.deepEqual(common.find((pair) => pair.teamId === "team-comum"), { teamId: "team-comum", player1Id: "vito", player2Id: "pigas" });
});
