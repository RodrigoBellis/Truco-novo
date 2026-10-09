import type {
  BracketMatch,
  GroupId,
  KnockoutKey,
  KnockoutMatchView,
  Match,
  MatchResult,
  SimulationCheck,
  SimulationGroupSummary,
  SimulationReport,
  StandingRow,
} from "@truco/shared";
import {
  EDITION_TEAM_COUNT,
  KNOCKOUT_PLAN,
  MATCHES_PER_GROUP,
  TEAMS_PER_GROUP,
  buildKnockoutView,
  decideQuarterfinalPairing,
  pendingTieClusters,
  pointsForResult,
  qualificationForPosition,
} from "@truco/shared";
import { store } from "../data/simulationStore.js";
import { CURRENT_EDITION, CURRENT_SEASON_YEAR } from "../data/tournamentConfig.js";
import { createSeededRandom, DEFAULT_SIMULATION_SEED, type RandomFn } from "../utils/seededRandom.js";
import { shuffle } from "../utils/shuffle.js";
import { performDraw } from "./simulation/drawService.js";
import { recordResult } from "./simulation/matchService.js";
import { computeStandings } from "./simulation/standingsService.js";
import { generateBracket, quarterfinalPairing } from "./simulation/bracketService.js";
import { finalizeTournament, findTournamentOutcome, type TournamentOutcome } from "./simulation/championService.js";

export class SimulationError extends Error {}

const KNOCKOUT_MATCHES = KNOCKOUT_PLAN.length;
const VALID_SCORES: MatchResult[] = [
  { setsA: 2, setsB: 0 },
  { setsA: 2, setsB: 1 },
  { setsA: 1, setsB: 2 },
  { setsA: 0, setsB: 2 },
];

interface CheckCollector {
  checks: SimulationCheck[];
  warnings: string[];
  /** Grupos em que o simulador decidiu um empate exato no lugar do administrador. */
  tieResolved: Set<GroupId>;
}

function addCheck(
  collector: CheckCollector,
  id: string,
  label: string,
  passed: boolean,
  detail: string,
  severity: SimulationCheck["severity"] = "erro",
): void {
  collector.checks.push({ id, label, passed, severity, detail });
}

/** Restaura o estado local para o ponto inicial: sem sorteio, jogos, campeão ou histórico da simulação. */
export function resetSimulation(): void {
  store.reset();
}

function ensureApprovedTeams(collector: CheckCollector): void {
  let approved = store.approvedTeams();

  if (approved.length < EDITION_TEAM_COUNT) {
    const pending = store.teams.filter((t) => t.status === "pendente");
    for (const team of pending) {
      if (store.approvedTeams().length >= EDITION_TEAM_COUNT) break;
      team.status = "aprovada";
      collector.warnings.push(`Dupla "${team.name}" foi aprovada automaticamente para completar as ${EDITION_TEAM_COUNT} vagas.`);
    }
    approved = store.approvedTeams();
  }

  if (approved.length !== EDITION_TEAM_COUNT) {
    throw new SimulationError(
      `A simulação exige exatamente ${EDITION_TEAM_COUNT} duplas aprovadas — encontradas ${approved.length}.`,
    );
  }
}

function pickScore(random: RandomFn): MatchResult {
  return VALID_SCORES[Math.floor(random() * VALID_SCORES.length)];
}

function playPendingMatches(stage: Match["stage"], random: RandomFn): number {
  const pending = store.matches.filter((m) => m.stage === stage && m.status === "pendente");
  pending.forEach((match) => {
    recordResult(match.id, pickScore(random));
  });
  return pending.length;
}

function teamName(teamId: string | null | undefined): string {
  if (!teamId) return "—";
  return store.getTeam(teamId)?.name ?? "—";
}

function winnerOfMatch(match: Match | undefined): string | null {
  if (!match?.result) return null;
  return match.result.setsA > match.result.setsB ? match.teamAId : match.teamBId;
}

function winnerOfBracket(bracket: BracketMatch | undefined): string | null {
  if (!bracket?.matchId) return null;
  return winnerOfMatch(store.matches.find((m) => m.id === bracket.matchId));
}

function positionTeamId(rows: StandingRow[], position: number): string | null {
  return rows.find((r) => r.position === position)?.teamId ?? null;
}

/**
 * Empate exato (pontos, vitórias, vitórias por 2x0, confronto direto e saldo de quedas iguais)
 * não tem critério automático: no campeonato real quem decide é o administrador. Aqui o
 * simulador faz esse papel por sorteio com a seed, registra a decisão e avisa no relatório.
 */
function resolvePendingTies(random: RandomFn, collector: CheckCollector): void {
  (["A", "B"] as const).forEach((groupId) => {
    pendingTieClusters(computeStandings(groupId)).forEach((cluster) => {
      const positions = cluster.map((row) => row.position).sort((a, b) => a - b);
      const decided = shuffle(cluster, random);
      decided.forEach((row, index) => {
        store.standingOverrides[groupId].push({ teamId: row.teamId, position: positions[index] });
      });
      collector.tieResolved.add(groupId);
      collector.warnings.push(
        `Grupo ${groupId}: empate exato entre ${cluster.map((row) => teamName(row.teamId)).join(", ")} ` +
          `(${cluster[0].pontos} pontos, ${cluster[0].vitorias} vitórias, ${cluster[0].vitorias2x0} por 2x0, confronto direto ${cluster[0].confrontoDireto} e saldo ${cluster[0].saldoSets}). ` +
          `Esgotados os cinco critérios, a simulação decidiu as posições ${positions.join("º, ")}º por sorteio, no lugar do administrador: ` +
          `${decided.map((row, index) => `${positions[index]}º ${teamName(row.teamId)}`).join(" · ")}.`,
      );
    });
  });
}

function buildGroupSummary(groupId: GroupId, rows: StandingRow[], collector: CheckCollector): SimulationGroupSummary {
  const standings = rows.map((row) => ({ ...row, teamName: teamName(row.teamId), zone: qualificationForPosition(row.position, rows.length) }));
  const namesIn = (zone: SimulationGroupSummary["standings"][number]["zone"]) => standings.filter((row) => row.zone === zone).map((row) => row.teamName);
  return {
    id: groupId,
    name: `Grupo ${groupId}`,
    teamNames: standings.map((row) => row.teamName),
    standings,
    qualifiedDirect: namesIn("semifinal")[0] ?? null,
    qualifiedQuarter: namesIn("quartas")[0] ?? null,
    qualifiedPlayoff: namesIn("repescagem"),
    eliminated: namesIn("eliminado")[0] ?? null,
    tieResolvedManually: collector.tieResolved.has(groupId),
  };
}

function validateGroups(collector: CheckCollector, standingsA: StandingRow[], standingsB: StandingRow[]): void {
  const groupA = store.getGroup("A");
  const groupB = store.getGroup("B");

  addCheck(
    collector,
    "grupos-tamanho",
    `Cada grupo possui exatamente ${TEAMS_PER_GROUP} duplas`,
    groupA.teamIds.length === TEAMS_PER_GROUP && groupB.teamIds.length === TEAMS_PER_GROUP,
    `Grupo A: ${groupA.teamIds.length} duplas · Grupo B: ${groupB.teamIds.length} duplas.`,
  );

  const allAssigned = [...groupA.teamIds, ...groupB.teamIds];
  const uniqueAssigned = new Set(allAssigned);
  addCheck(
    collector,
    "duplas-sem-duplicidade",
    "Nenhuma dupla foi duplicada entre os grupos",
    uniqueAssigned.size === allAssigned.length,
    `${allAssigned.length} alocações para ${uniqueAssigned.size} duplas distintas.`,
  );

  const approved = store.approvedTeams();
  const withoutGroup = approved.filter((team) => !team.groupId);
  addCheck(
    collector,
    "duplas-com-grupo",
    "Nenhuma dupla aprovada ficou sem grupo",
    withoutGroup.length === 0,
    withoutGroup.length === 0 ? `Todas as ${EDITION_TEAM_COUNT} duplas foram alocadas.` : `Sem grupo: ${withoutGroup.map((t) => t.name).join(", ")}.`,
  );

  const seededTeams = approved.filter((team) => team.seeded);
  const seededGroups = new Set(seededTeams.map((team) => team.groupId));
  addCheck(
    collector,
    "cabecas-de-chave",
    "Cabeças de chave em grupos diferentes",
    seededTeams.length === 2 && seededGroups.size === 2,
    seededTeams.map((team) => `${team.name} → Grupo ${team.groupId}`).join(" · "),
  );

  addCheck(
    collector,
    "classificacao-completa",
    `Classificação calculada para as ${EDITION_TEAM_COUNT} duplas`,
    standingsA.length === TEAMS_PER_GROUP && standingsB.length === TEAMS_PER_GROUP,
    `Grupo A: ${standingsA.length} linhas · Grupo B: ${standingsB.length} linhas.`,
  );

  const zonesOf = (rows: StandingRow[]) => rows.map((row) => qualificationForPosition(row.position, rows.length)).join(", ");
  const expectedZones = "semifinal, quartas, repescagem, repescagem, eliminado";
  addCheck(
    collector,
    "zonas-por-posicao",
    "1º semifinal, 2º quartas, 3º e 4º repescagem, 5º eliminado",
    zonesOf(standingsA) === expectedZones && zonesOf(standingsB) === expectedZones,
    `Grupo A: ${zonesOf(standingsA)} · Grupo B: ${zonesOf(standingsB)}.`,
  );

  const stillPending = [...standingsA, ...standingsB].filter((row) => row.tiePending);
  addCheck(
    collector,
    "empates-resolvidos",
    "Nenhum empate exato ficou sem decisão antes do mata-mata",
    stillPending.length === 0,
    stillPending.length === 0 ? "Todas as posições estão definidas." : `Pendentes: ${stillPending.map((row) => teamName(row.teamId)).join(", ")}.`,
  );
}

function validateMatches(collector: CheckCollector): void {
  const groupMatches = store.matches.filter((m) => m.stage === "grupos");
  const knockoutMatches = store.matches.filter((m) => m.stage === "mata-mata");

  addCheck(
    collector,
    "jogos-fase-grupos",
    "Todos os confrontos da fase de grupos foram gerados",
    groupMatches.length === MATCHES_PER_GROUP * 2,
    `${groupMatches.length} jogos gerados (esperado ${MATCHES_PER_GROUP * 2}).`,
  );

  const missingParticipants = store.matches.filter(
    (m) => !m.teamAId || !m.teamBId || m.teamAId === m.teamBId || !store.getTeam(m.teamAId) || !store.getTeam(m.teamBId),
  );
  addCheck(
    collector,
    "jogos-com-participantes",
    "Nenhuma partida ficou sem participantes válidos",
    missingParticipants.length === 0,
    missingParticipants.length === 0
      ? `${store.matches.length} partidas com duas duplas distintas.`
      : `${missingParticipants.length} partidas inválidas encontradas.`,
  );

  const pending = store.matches.filter((m) => m.status === "pendente");
  addCheck(
    collector,
    "jogos-disputados",
    "Todas as partidas foram disputadas",
    pending.length === 0,
    pending.length === 0 ? `${store.matches.length} partidas concluídas.` : `${pending.length} partidas ainda pendentes.`,
  );

  const invalidScores = store.matches.filter((m) => {
    if (!m.result) return true;
    return !VALID_SCORES.some((score) => score.setsA === m.result!.setsA && score.setsB === m.result!.setsB);
  });
  addCheck(
    collector,
    "placares-validos",
    "Todos os placares usam 2x0, 2x1, 1x2 ou 0x2",
    invalidScores.length === 0,
    invalidScores.length === 0 ? "Nenhum placar fora do padrão." : `${invalidScores.length} placares inválidos.`,
  );

  addCheck(
    collector,
    "jogos-mata-mata",
    `Mata-mata com ${KNOCKOUT_MATCHES} confrontos (2 de repescagem + 2 quartas + 2 semifinais + final)`,
    knockoutMatches.length === KNOCKOUT_MATCHES,
    `${knockoutMatches.length} partidas eliminatórias geradas.`,
  );
}

function validateStandingsMath(collector: CheckCollector, groupId: GroupId, rows: StandingRow[]): void {
  const groupMatches = store.matches.filter((m) => m.stage === "grupos" && m.groupId === groupId && m.result);
  const failures: string[] = [];

  rows.forEach((row) => {
    let jogos = 0;
    let vitorias = 0;
    let vitorias2x0 = 0;
    let derrotas = 0;
    let pontos = 0;
    let saldo = 0;

    groupMatches.forEach((match) => {
      const isTeamA = match.teamAId === row.teamId;
      const isTeamB = match.teamBId === row.teamId;
      if (!isTeamA && !isTeamB) return;

      const result = match.result!;
      const setsFor = isTeamA ? result.setsA : result.setsB;
      const setsAgainst = isTeamA ? result.setsB : result.setsA;

      jogos += 1;
      pontos += pointsForResult(result, isTeamA);
      saldo += setsFor - setsAgainst;
      if (setsFor > setsAgainst) {
        vitorias += 1;
        if (setsAgainst === 0) vitorias2x0 += 1;
      } else derrotas += 1;
    });

    if (
      row.jogos !== jogos ||
      row.vitorias !== vitorias ||
      row.vitorias2x0 !== vitorias2x0 ||
      row.derrotas !== derrotas ||
      row.pontos !== pontos ||
      row.saldoSets !== saldo
    ) {
      failures.push(teamName(row.teamId));
    }
  });

  // Recalcula o confronto direto por fora: vitórias nos jogos entre as duplas iguais em
  // pontos, vitórias e vitórias por 2x0.
  const headToHead = (row: StandingRow) => {
    const tied = new Set(rows.filter((other) => other.pontos === row.pontos && other.vitorias === row.vitorias && other.vitorias2x0 === row.vitorias2x0).map((other) => other.teamId));
    if (tied.size < 2) return 0;
    return groupMatches.filter((match) => tied.has(match.teamAId) && tied.has(match.teamBId) && winnerOfMatch(match) === row.teamId).length;
  };
  rows.forEach((row) => {
    if (row.confrontoDireto !== headToHead(row)) failures.push(`${teamName(row.teamId)} (confronto direto)`);
  });

  // Pontos, vitórias, vitórias por 2x0, confronto direto e saldo de quedas, nesta ordem:
  // nenhuma linha pode estar acima de outra melhor.
  const orderedCorrectly = rows.every((row, index) => {
    if (row.position !== index + 1) return false;
    if (index === 0) return true;
    const previous = rows[index - 1];
    if (previous.pontos !== row.pontos) return previous.pontos > row.pontos;
    if (previous.vitorias !== row.vitorias) return previous.vitorias > row.vitorias;
    if (previous.vitorias2x0 !== row.vitorias2x0) return previous.vitorias2x0 > row.vitorias2x0;
    if (previous.confrontoDireto !== row.confrontoDireto) return previous.confrontoDireto > row.confrontoDireto;
    return previous.saldoSets >= row.saldoSets;
  });

  addCheck(
    collector,
    `classificacao-calculo-${groupId}`,
    `Pontos, vitórias, 2x0, confronto direto, derrotas e saldo corretos no Grupo ${groupId}`,
    failures.length === 0,
    failures.length === 0 ? "Todos os totais conferem com os resultados registrados." : `Divergências: ${failures.join(", ")}.`,
  );

  addCheck(
    collector,
    `classificacao-ordem-${groupId}`,
    `Ordenação da classificação do Grupo ${groupId} está correta`,
    orderedCorrectly,
    orderedCorrectly ? "Ordenada por pontos, vitórias, vitórias por 2x0, confronto direto e saldo de quedas." : "Ordem inconsistente com os critérios de desempate.",
  );
}

function validateKnockout(collector: CheckCollector, standingsA: StandingRow[], standingsB: StandingRow[], view: KnockoutMatchView[]): void {
  const fixture = (key: KnockoutKey) => view.find((item) => item.key === key)!;
  const winnerOf = (key: KnockoutKey) => {
    const item = fixture(key);
    return item.sideA.winner ? item.sideA.teamId : item.sideB.winner ? item.sideB.teamId : null;
  };
  const at = (group: GroupId, position: number) => positionTeamId(group === "A" ? standingsA : standingsB, position);
  const groupOf = (teamId: string | null) => (teamId ? store.getTeam(teamId)?.groupId ?? null : null);

  // Cruzamento das quartas recalculado por fora, a partir de quem venceu cada repescagem.
  const groupR1 = groupOf(winnerOf("R1"));
  const groupR2 = groupOf(winnerOf("R2"));
  const pairing = groupR1 && groupR2 ? decideQuarterfinalPairing(groupR1, groupR2) : null;

  const expected: Array<[KnockoutKey, string, string | null, string | null]> = [
    ["R1", "Repescagem 1: 3º A × 4º B", at("A", 3), at("B", 4)],
    ["R2", "Repescagem 2: 3º B × 4º A", at("B", 3), at("A", 4)],
    ["Q1", "Quartas 1: 2º A × vencedor da repescagem que evita reencontro", at("A", 2), winnerOf(pairing?.swapped ? "R1" : "R2")],
    ["Q2", "Quartas 2: 2º B × o outro vencedor da repescagem", at("B", 2), winnerOf(pairing?.swapped ? "R2" : "R1")],
    ["S1", "Semifinal 1: 1º A × vencedor das Quartas 2", at("A", 1), winnerOf("Q2")],
    ["S2", "Semifinal 2: 1º B × vencedor das Quartas 1", at("B", 1), winnerOf("Q1")],
    ["F", "Final: vencedores das semifinais", winnerOf("S1"), winnerOf("S2")],
  ];

  const byRound: Array<[string, string, KnockoutKey[]]> = [
    ["repescagem-cruzada", "Repescagem cruza 3º A × 4º B e 3º B × 4º A", ["R1", "R2"]],
    ["quartas-com-segundos", "Quartas recebem os 2º colocados e os vencedores da repescagem", ["Q1", "Q2"]],
    ["semifinais-com-lideres", "Semifinais recebem os 1º colocados e os vencedores das quartas", ["S1", "S2"]],
    ["final-com-vencedores", "Final reúne os vencedores das semifinais", ["F"]],
  ];
  byRound.forEach(([id, label, keys]) => {
    const failures = expected
      .filter(([key]) => keys.includes(key))
      .filter(([key, , teamA, teamB]) => !teamA || !teamB || fixture(key).sideA.teamId !== teamA || fixture(key).sideB.teamId !== teamB)
      .map(([, description]) => description);
    addCheck(
      collector,
      id,
      label,
      failures.length === 0,
      failures.length === 0
        ? keys.map((key) => `${fixture(key).label}: ${fixture(key).sideA.name} × ${fixture(key).sideB.name}`).join(" · ")
        : `Divergências em: ${failures.join("; ")}.`,
    );
  });

  // O cruzamento escolhido tem de ser o de menos reencontros; só sobra reencontro quando os
  // dois vencedores da repescagem saíram do mesmo grupo.
  const quarterRematches = (["Q1", "Q2"] as KnockoutKey[]).filter((key) => fixture(key).sameGroup).length;
  const bothFromSameGroup = Boolean(groupR1 && groupR1 === groupR2);
  addCheck(
    collector,
    "quartas-sem-reencontro",
    "Quartas evitam reencontro do mesmo grupo sempre que possível",
    pairing !== null && quarterRematches === pairing.rematches && (quarterRematches === 0) === !bothFromSameGroup && quarterRematches <= 1,
    quarterRematches === 0
      ? `Nenhum reencontro${pairing?.avoided ? ` (cruzamento trocado: ${pairing.avoided} evitados)` : ""}.`
      : `1 reencontro inevitável: os dois vencedores da repescagem são do Grupo ${groupR1}.`,
  );

  const teamsIn = (keys: KnockoutKey[]) => new Set(keys.flatMap((key) => [fixture(key).sideA.teamId, fixture(key).sideB.teamId]));
  const eliminated = [at("A", TEAMS_PER_GROUP), at("B", TEAMS_PER_GROUP)].filter(Boolean) as string[];
  const everyone = teamsIn(KNOCKOUT_PLAN.map((item) => item.key));
  const intruders = eliminated.filter((teamId) => everyone.has(teamId));
  addCheck(
    collector,
    "eliminados-nao-avancaram",
    `Nenhum ${TEAMS_PER_GROUP}º colocado avançou para o mata-mata`,
    intruders.length === 0,
    intruders.length === 0
      ? `Eliminados: ${eliminated.map(teamName).join(" e ")}.`
      : `Duplas eliminadas encontradas no mata-mata: ${intruders.map(teamName).join(", ")}.`,
  );

  // Quem entra direto numa fase não pode aparecer nas fases anteriores.
  const leaders = [at("A", 1), at("B", 1)];
  const seconds = [at("A", 2), at("B", 2)];
  const beforeSemis = teamsIn(["R1", "R2", "Q1", "Q2"]);
  const repechage = teamsIn(["R1", "R2"]);
  const byes = leaders.every((teamId) => teamId && !beforeSemis.has(teamId)) && seconds.every((teamId) => teamId && !repechage.has(teamId));
  addCheck(
    collector,
    "entradas-diretas",
    "1º colocados só jogam a partir da semifinal e 2º colocados a partir das quartas",
    byes,
    `Líderes: ${leaders.map(teamName).join(" e ")} · Segundos: ${seconds.map(teamName).join(" e ")}.`,
  );

  const progressionFailures: string[] = [];
  store.bracketMatches.forEach((bracket) => {
    const match = bracket.matchId ? store.matches.find((m) => m.id === bracket.matchId) : undefined;
    if (!match) return;

    ([["slotA", bracket.slotA, match.teamAId], ["slotB", bracket.slotB, match.teamBId]] as const).forEach(
      ([slotName, slot, actualTeamId]) => {
        if (slot.type !== "winner") return;
        const expectedWinner = winnerOfBracket(store.bracketMatches.find((b) => b.id === slot.bracketMatchId));
        if (expectedWinner && expectedWinner !== actualTeamId) {
          progressionFailures.push(`${bracket.label} (${slotName})`);
        }
      },
    );
  });

  addCheck(
    collector,
    "vencedores-avancaram",
    "Vencedores avançaram corretamente em cada fase",
    progressionFailures.length === 0,
    progressionFailures.length === 0
      ? "Todas as chaves receberam o vencedor da fase anterior."
      : `Divergências: ${progressionFailures.join(", ")}.`,
  );
}

function validateOutcome(collector: CheckCollector, outcome: TournamentOutcome | null): void {
  addCheck(
    collector,
    "campeao-definido",
    "Campeão definido a partir da final",
    Boolean(outcome),
    outcome ? `Campeão: ${outcome.championTeam.name}.` : "A final não produziu um campeão.",
  );

  if (!outcome) return;

  const finalWinnerId = winnerOfMatch(outcome.finalMatch);
  addCheck(
    collector,
    "campeao-vencedor-final",
    "Campeão corresponde ao vencedor da final",
    finalWinnerId === outcome.championTeam.id,
    `Final ${outcome.finalScore}: ${outcome.championTeam.name} x ${outcome.runnerUpTeam.name}.`,
  );

  const championPlayers = [outcome.championTeam.player1Id, outcome.championTeam.player2Id];
  const rankingUpdated = championPlayers.every((playerId) => {
    const entry = store.ranking.find((r) => r.playerId === playerId);
    return Boolean(entry && entry.titles >= 1);
  });
  addCheck(
    collector,
    "ranking-atualizado",
    "Ranking de campeões creditou o título aos dois jogadores",
    rankingUpdated,
    championPlayers
      .map((playerId) => {
        const entry = store.ranking.find((r) => r.playerId === playerId);
        return `${entry?.playerName ?? playerId}: ${entry?.titles ?? 0} título(s)`;
      })
      .join(" · "),
  );

  const lastHistory = store.history[store.history.length - 1];
  const historyMatchesChampion =
    Boolean(lastHistory) && lastHistory.champions.join(" & ").length > 0 && lastHistory.finalResult === outcome.finalScore;
  addCheck(
    collector,
    "historico-atualizado",
    "Edição atual adicionada ao histórico",
    historyMatchesChampion,
    lastHistory ? `${lastHistory.name} (${lastHistory.year}) — ${lastHistory.champions.join(" e ")}.` : "Histórico não atualizado.",
  );

  addCheck(
    collector,
    "dashboard-atualizado",
    "Dashboard reflete o encerramento do campeonato",
    store.currentPhase === "Campeonato Finalizado",
    `Fase atual: ${store.currentPhase}.`,
  );

  // Aviso (não bloqueia a aprovação): o histórico semente tem menos edições do que a identidade visual anuncia.
  const registeredEdition = store.history.length;
  addCheck(
    collector,
    "edicao-historico-consistente",
    "Edição registrada no histórico bate com a edição em disputa",
    registeredEdition === CURRENT_EDITION,
    registeredEdition === CURRENT_EDITION
      ? `Edição ${registeredEdition} registrada.`
      : `A edição encerrada foi arquivada como ${registeredEdition}ª, mas o sistema anuncia a ${CURRENT_EDITION}ª Edição. ` +
        `Faltam ${CURRENT_EDITION - registeredEdition} edição(ões) anteriores nos dados-base do histórico.`,
    "aviso",
  );
}

export interface SimulationOptions {
  seed?: number;
  year?: number;
}

/**
 * Executa o campeonato inteiro de forma determinística, em memória, e devolve o relatório de
 * validação. Nada aqui lê ou grava o banco: os dados vêm das fixtures de data/seed.ts e os
 * placares são sorteados pela seed. As regras (classificação, zonas e chaveamento) são as
 * mesmas funções de @truco/shared usadas pelo campeonato real.
 */
export function runFullSimulation(options: SimulationOptions = {}): SimulationReport {
  const seed = options.seed ?? DEFAULT_SIMULATION_SEED;
  const year = options.year ?? CURRENT_SEASON_YEAR;
  const random = createSeededRandom(seed);
  const collector: CheckCollector = { checks: [], warnings: [], tieResolved: new Set() };

  // 1. Ambiente limpo e 10 duplas aprovadas.
  resetSimulation();
  ensureApprovedTeams(collector);

  // 2. Sorteio e confrontos da fase de grupos.
  performDraw(random);

  // 3. Resultados da fase de grupos; a classificação sai da regra compartilhada.
  playPendingMatches("grupos", random);

  // 4. Empate exato: decisão simulada do administrador; só então o mata-mata é gerado.
  resolvePendingTies(random, collector);
  if (store.bracketMatches.length === 0) generateBracket();

  // 5. Repescagem → quartas → semifinais → final: cada fase concluída abre a seguinte.
  let guard = 0;
  while (store.matches.some((m) => m.stage === "mata-mata" && m.status === "pendente")) {
    if (guard > 10) {
      throw new SimulationError("A progressão do mata-mata não convergiu — possível ciclo na chave.");
    }
    playPendingMatches("mata-mata", random);
    guard += 1;
  }

  // 6. Campeão, ranking e histórico (da simulação).
  const outcome = finalizeTournament(year) ?? findTournamentOutcome();

  const standingsA = computeStandings("A");
  const standingsB = computeStandings("B");
  const knockout = buildKnockoutView({
    bracket: store.bracketMatches,
    matches: store.matches,
    teamName: (teamId) => store.getTeam(teamId)?.name,
    groupOf: (teamId) => store.getTeam(teamId)?.groupId,
  });
  if (quarterfinalPairing?.inevitable) {
    const rematch = knockout.find((item) => item.round === "quartas" && item.sameGroup);
    collector.warnings.push(`Reencontro inevitável nas quartas: ${rematch?.sideA.name} × ${rematch?.sideB.name} já se enfrentaram na fase de grupos. Os dois vencedores da repescagem saíram do mesmo grupo.`);
  }

  // 7. Validações automáticas.
  addCheck(
    collector,
    "duplas-aprovadas",
    `${EDITION_TEAM_COUNT} duplas aprovadas participando`,
    store.approvedTeams().length === EDITION_TEAM_COUNT,
    `${store.approvedTeams().length} duplas aprovadas.`,
  );
  validateGroups(collector, standingsA, standingsB);
  validateMatches(collector);
  validateStandingsMath(collector, "A", standingsA);
  validateStandingsMath(collector, "B", standingsB);
  validateKnockout(collector, standingsA, standingsB, knockout);
  validateOutcome(collector, outcome);

  const errors = collector.checks.filter((c) => !c.passed && c.severity === "erro").map((c) => `${c.label}: ${c.detail}`);
  const warnings = [
    ...collector.warnings,
    ...collector.checks.filter((c) => !c.passed && c.severity === "aviso").map((c) => `${c.label}: ${c.detail}`),
  ];

  const groupMatches = store.matches.filter((m) => m.stage === "grupos").length;
  const knockoutMatches = store.matches.filter((m) => m.stage === "mata-mata").length;

  return {
    seed,
    warnings,
    executedAt: new Date().toISOString(),
    totalPlayers: store.players.filter((p) => p.role === "jogador").length,
    totalTeams: store.teams.length,
    approvedTeams: store.approvedTeams().length,
    groups: [buildGroupSummary("A", standingsA, collector), buildGroupSummary("B", standingsB, collector)],
    knockout,
    quarterfinals: quarterfinalPairing,
    groupMatches,
    knockoutMatches,
    totalMatches: groupMatches + knockoutMatches,
    final: {
      championTeamName: outcome?.championTeam.name ?? null,
      runnerUpTeamName: outcome?.runnerUpTeam.name ?? null,
      finalScore: outcome?.finalScore ?? null,
    },
    checks: collector.checks,
    errors,
    status: errors.length === 0 ? "SIMULAÇÃO APROVADA" : "SIMULAÇÃO REPROVADA",
  };
}
