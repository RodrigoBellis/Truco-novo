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

const rosterPlayers: SeedPlayer[] = [
  { id: "p-bagriel", name: "Bagriel" },
  { id: "p-diguinho", name: "Diguinho" },
  { id: "p-xablauu", name: "Xablauu" },
  { id: "p-alexandre", name: "Alexandre" },
  { id: "p-vito", name: "Vito" },
  { id: "p-luizao", name: "Luizão" },
  { id: "p-pg", name: "PG" },
  { id: "p-caio", name: "Caio" },
  { id: "p-ronaldo", name: "Ronaldo" },
  { id: "p-rodrigo", name: "Rodrigo" },
  { id: "p-marcelo", name: "Marcelo" },
  { id: "p-juninho", name: "Juninho" },
  { id: "p-bitula", name: "Bitula" },
  { id: "p-galao", name: "Galão" },
  { id: "p-rafael", name: "Rafael" },
  { id: "p-pigas", name: "Pigas" },
  { id: "p-rogerio", name: "Rogério" },
  { id: "p-waguinho", name: "Waguinho" },
  { id: "p-vitor", name: "Vitor" },
  { id: "p-fernando", name: "Fernando" },
  { id: "p-jp", name: "JP" },
  { id: "p-davi", name: "Davi" },
  { id: "p-bruno", name: "Bruno" },
  { id: "p-thiaguinho", name: "Thiaguinho" },
];

const pendingRosterPlayers: SeedPlayer[] = [
  { id: "p-kaka", name: "Kaká" },
  { id: "p-nenem", name: "Neném" },
  { id: "p-zeca", name: "Zeca" },
  { id: "p-duda", name: "Duda" },
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
}

const seedTeams: SeedTeam[] = [
  { id: "t-bagriel-diguinho", player1: rosterPlayers[0], player2: rosterPlayers[1], seeded: true, isPlaceholder: false, status: "aprovada" },
  { id: "t-xablauu-alexandre", player1: rosterPlayers[2], player2: rosterPlayers[3], seeded: false, isPlaceholder: false, status: "aprovada" },
  { id: "t-vito-luizao", player1: rosterPlayers[4], player2: rosterPlayers[5], seeded: false, isPlaceholder: false, status: "aprovada" },
  { id: "t-pg-caio", player1: rosterPlayers[6], player2: rosterPlayers[7], seeded: false, isPlaceholder: false, status: "aprovada" },
  { id: "t-ronaldo-rodrigo", player1: rosterPlayers[8], player2: rosterPlayers[9], seeded: true, isPlaceholder: false, status: "aprovada" },
  { id: "t-marcelo-juninho", player1: rosterPlayers[10], player2: rosterPlayers[11], seeded: false, isPlaceholder: true, status: "aprovada" },
  { id: "t-bitula-galao", player1: rosterPlayers[12], player2: rosterPlayers[13], seeded: false, isPlaceholder: false, status: "aprovada" },
  { id: "t-rafael-pigas", player1: rosterPlayers[14], player2: rosterPlayers[15], seeded: false, isPlaceholder: false, status: "aprovada" },
  { id: "t-rogerio-waguinho", player1: rosterPlayers[16], player2: rosterPlayers[17], seeded: false, isPlaceholder: false, status: "aprovada" },
  { id: "t-vitor-fernando", player1: rosterPlayers[18], player2: rosterPlayers[19], seeded: false, isPlaceholder: false, status: "aprovada" },
  { id: "t-jp-davi", player1: rosterPlayers[20], player2: rosterPlayers[21], seeded: false, isPlaceholder: false, status: "aprovada" },
  { id: "t-bruno-thiaguinho", player1: rosterPlayers[22], player2: rosterPlayers[23], seeded: false, isPlaceholder: true, status: "aprovada" },
  { id: "t-kaka-nenem", player1: pendingRosterPlayers[0], player2: pendingRosterPlayers[1], seeded: false, isPlaceholder: false, status: "pendente" },
  { id: "t-zeca-duda", player1: pendingRosterPlayers[2], player2: pendingRosterPlayers[3], seeded: false, isPlaceholder: false, status: "pendente" },
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
  strength: 3,
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
    championIds: ["p-bitula", "p-galao"],
    notes: "Bitula e Galão quebraram a sequência e levantaram o troféu pela primeira vez.",
  },
  {
    edition: 4,
    year: 2025,
    championIds: ["p-ronaldo", "p-rodrigo"],
    notes: "Ronaldo e Rodrigo venceram a última edição e entraram como cabeças de chave na atual.",
  },
];

function nameOf(playerId: string): string {
  return rosterPlayers.find((player) => player.id === playerId)?.name ?? playerId;
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

export const SEED_RANKING: RankingEntry[] = rosterPlayers
  .map((player) => ({
    playerId: player.id,
    playerName: player.name,
    titles: HALL_OF_FAME.filter((edition) => edition.championIds.includes(player.id)).length,
  }))
  .sort((a, b) => b.titles - a.titles || a.playerName.localeCompare(b.playerName));
