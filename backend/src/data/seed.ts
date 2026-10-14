import type { Player, Team, RankingEntry, HistoryEntry } from "@truco/shared";

export const ADMIN_PLAYER: Player = {
  id: "admin-1",
  name: "Administrador",
  role: "admin",
  teamId: null,
  avatarUrl: null,
};

interface SeedPlayer {
  id: string;
  name: string;
}

// Lista oficial da 5ª edição (14/10/2026): 7 duplas, 14 jogadores. Rafinha é o antigo "Rafael"
// (mesmo id); Digão é o pai do Diguinho, outra pessoa.
const rosterPlayers: SeedPlayer[] = [
  { id: "p-pigas", name: "Pigas" },
  { id: "p-diguinho", name: "Diguinho" },
  { id: "p-ronaldo", name: "Ronaldo" },
  { id: "p-rodrigo", name: "Rodrigo" },
  { id: "p-jp", name: "JP" },
  { id: "p-anderson", name: "Anderson" },
  { id: "p-saulo", name: "Saulo" },
  { id: "p-vitor", name: "Vitor" },
  { id: "p-pg", name: "PG" },
  { id: "p-alexandre", name: "Alexandre" },
  { id: "p-rogerio", name: "Rogério" },
  { id: "p-waguinho", name: "Waguinho" },
  { id: "p-digao", name: "Digão" },
  { id: "p-rafael", name: "Rafinha" },
];

const pendingRosterPlayers: SeedPlayer[] = [
  { id: "p-kaka", name: "Kaká" },
  { id: "p-nenem", name: "Neném" },
];

function toPlayer(seedPlayer: SeedPlayer, teamId: string): Player {
  return {
    id: seedPlayer.id,
    name: seedPlayer.name,
    role: "jogador",
    teamId,
    avatarUrl: null,
  };
}

interface SeedTeam {
  id: string;
  player1: SeedPlayer;
  player2: SeedPlayer;
  seeded: boolean;
  isPlaceholder: boolean;
  status: "pendente" | "aprovada";
  strength: number;
}

const team = (id: string, first: number, strength: number, seeded = false): SeedTeam => ({
  id, player1: rosterPlayers[first], player2: rosterPlayers[first + 1], seeded, isPlaceholder: false, status: "aprovada", strength,
});

const seedTeams: SeedTeam[] = [
  team("t-pigas-diguinho", 0, 4),
  team("t-ronaldo-rodrigo", 2, 5, true),
  team("t-jp-anderson", 4, 3),
  team("t-saulo-vitor", 6, 3),
  team("t-pg-alexandre", 8, 2),
  team("t-rogerio-waguinho", 10, 2),
  team("t-digao-rafinha", 12, 2),
  // A edição tem 7 duplas: esta fica fora da simulação, como inscrição pendente.
  { id: "t-kaka-nenem", player1: pendingRosterPlayers[0], player2: pendingRosterPlayers[1], seeded: false, isPlaceholder: false, status: "pendente", strength: 3 },
];

export const SEED_PLAYERS: Player[] = [
  ADMIN_PLAYER,
  ...seedTeams.flatMap((team) => [toPlayer(team.player1, team.id), toPlayer(team.player2, team.id)]),
];

export const SEED_TEAMS: Team[] = seedTeams.map((team) => ({
  id: team.id,
  name: `${team.player1.name} & ${team.player2.name}`,
  player1Id: team.player1.id,
  player2Id: team.player2.id,
  status: team.status,
  seeded: team.seeded,
  isPlaceholder: team.isPlaceholder,
  groupId: null,
  strength: team.strength,
}));

/**
 * Hall da Fama — campeões reais das edições já disputadas.
 * É a fonte única de verdade: o histórico e o ranking individual são derivados daqui,
 * então a contagem de títulos nunca fica dessincronizada dos campeões.
 */
interface HallOfFameEdition {
  edition: number;
  year: number;
  championIds: [string, string];
  notes: string;
}

const HALL_OF_FAME: HallOfFameEdition[] = [
  {
    edition: 1,
    year: 2022,
    championIds: ["p-bagriel", "p-diguinho"],
    notes: "A dupla que abriu o Hall da Fama conquistando a primeira edição do Truco do Novo.",
  },
  {
    edition: 2,
    year: 2023,
    championIds: ["p-bagriel", "p-diguinho"],
    notes: "Bicampeonato consecutivo — a dupla confirmou o favoritismo e virou cabeça de chave.",
  },
  {
    edition: 3,
    year: 2024,
    championIds: ["p-bitula", "p-vinicius"],
    notes: "Bitula e Vinícius quebraram a sequência e levantaram o troféu pela primeira vez.",
  },
  {
    edition: 4,
    year: 2025,
    championIds: ["p-ronaldo", "p-rodrigo"],
    notes: "Ronaldo e Rodrigo venceram a última edição e entraram como cabeças de chave na atual.",
  },
];

/**
 * Campeões de edições passadas que não estão no elenco simulado da edição atual.
 * Entram só no histórico e no ranking; nunca viram dupla nem conta da simulação.
 */
const historicPlayers: SeedPlayer[] = [
  { id: "p-bagriel", name: "Bagriel" },
  { id: "p-bitula", name: "Bitula" },
  { id: "p-vinicius", name: "Vinícius" },
];

function nameOf(playerId: string): string {
  return [...rosterPlayers, ...historicPlayers].find((player) => player.id === playerId)?.name ?? playerId;
}

export const SEED_HISTORY: HistoryEntry[] = HALL_OF_FAME.map((edition) => ({
  id: `h-edicao-${edition.edition}`,
  edition: edition.edition,
  name: `${edition.edition}ª Copa Truco do Novo`,
  year: edition.year,
  champions: [nameOf(edition.championIds[0]), nameOf(edition.championIds[1])],
  runnersUp: null,
  finalResult: null,
  notes: edition.notes,
}));

export const SEED_RANKING: RankingEntry[] = [...rosterPlayers, ...historicPlayers]
  .map((player) => ({
    playerId: player.id,
    playerName: player.name,
    titles: HALL_OF_FAME.filter((edition) => edition.championIds.includes(player.id)).length,
  }))
  .sort((a, b) => b.titles - a.titles || a.playerName.localeCompare(b.playerName));
