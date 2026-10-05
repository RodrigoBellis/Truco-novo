import type {
  BracketMatch,
  GroupId,
  Match,
  MatchResult,
  SimulationCheck,
  SimulationGroupSummary,
  SimulationReport,
  StandingRow,
} from "@truco/shared";
import { pointsForResult } from "@truco/shared";
import { store } from "../data/simulationStore.js";
import { CURRENT_EDITION, CURRENT_SEASON_YEAR } from "../data/tournamentConfig.js";
import { createSeededRandom, DEFAULT_SIMULATION_SEED, type RandomFn } from "../utils/seededRandom.js";
import { performDraw } from "./simulation/drawService.js";
import { LEGACY_SIMULATION_WARNING } from "./simulation/drawService.js";
import { recordResult } from "./simulation/matchService.js";
import { computeStandings } from "./simulation/standingsService.js";
import { finalizeTournament, findTournamentOutcome, type TournamentOutcome } from "./simulation/championService.js";

export class SimulationError extends Error {}

const EXPECTED_TEAMS = 12;
const TEAMS_PER_GROUP = 6;
const GROUP_MATCHES_PER_GROUP = (TEAMS_PER_GROUP * (TEAMS_PER_GROUP - 1)) / 2;
const KNOCKOUT_MATCHES = 9;
const VALID_SCORES: MatchResult[] = [
  { setsA: 2, setsB: 0 },
  { setsA: 2, setsB: 1 },
  { setsA: 1, setsB: 2 },
  { setsA: 0, setsB: 2 },
];

interface CheckCollector {
  checks: SimulationCheck[];
  warnings: string[];
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

  if (approved.length < EXPECTED_TEAMS) {
    const pending = store.teams.filter((t) => t.status === "pendente");
    for (const team of pending) {
      if (store.approvedTeams().length >= EXPECTED_TEAMS) break;
      team.status = "aprovada";
      collector.warnings.push(`Dupla "${team.name}" foi aprovada automaticamente para completar as ${EXPECTED_TEAMS} vagas.`);
    }
    approved = store.approvedTeams();
  }

  if (approved.length !== EXPECTED_TEAMS) {
    throw new SimulationError(
      `A simulação exige exatamente ${EXPECTED_TEAMS} duplas aprovadas — encontradas ${approved.length}.`,
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

function buildGroupSummary(groupId: GroupId, rows: StandingRow[]): SimulationGroupSummary {
  return {
    id: groupId,
    name: `Grupo ${groupId}`,
    teamNames: rows.map((row) => teamName(row.teamId)),
    qualifiedDirect: rows[0] ? teamName(rows[0].teamId) : null,
    qualifiedPlayoff: rows.slice(1, 5).map((row) => teamName(row.teamId)),
    eliminated: rows[5] ? teamName(rows[5].teamId) : null,
  };
}

function validateGroups(collector: CheckCollector, standingsA: StandingRow[], standingsB: StandingRow[]): void {
  const groupA = store.getGroup("A");
  const groupB = store.getGroup("B");

  addCheck(
    collector,
    "grupos-tamanho",
    "Cada grupo possui exatamente 6 duplas no simulador isolado legado",
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
    withoutGroup.length === 0 ? "Todas as 12 duplas foram alocadas." : `Sem grupo: ${withoutGroup.map((t) => t.name).join(", ")}.`,
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
    "Classificação calculada para as 12 duplas",
    standingsA.length === TEAMS_PER_GROUP && standingsB.length === TEAMS_PER_GROUP,
    `Grupo A: ${standingsA.length} linhas · Grupo B: ${standingsB.length} linhas.`,
  );
}

function validateMatches(collector: CheckCollector): void {
  const groupMatches = store.matches.filter((m) => m.stage === "grupos");
  const knockoutMatches = store.matches.filter((m) => m.stage === "mata-mata");

  addCheck(
    collector,
    "jogos-fase-grupos",
    "Todos os confrontos da fase de grupos foram gerados",
    groupMatches.length === GROUP_MATCHES_PER_GROUP * 2,
    `${groupMatches.length} jogos gerados (esperado ${GROUP_MATCHES_PER_GROUP * 2}).`,
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
    "Chave eliminatória com 9 confrontos (4 cruzados + 2 quartas + 2 semis + final)",
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
      if (setsFor > setsAgainst) vitorias += 1;
      else derrotas += 1;
    });

    if (
      row.jogos !== jogos ||
      row.vitorias !== vitorias ||
      row.derrotas !== derrotas ||
      row.pontos !== pontos ||
      row.saldoSets !== saldo
    ) {
      failures.push(teamName(row.teamId));
    }
  });

  const orderedCorrectly = rows.every((row, index) => {
    if (index === 0) return row.position === 1;
    const previous = rows[index - 1];
    if (row.position !== index + 1) return false;
    if (previous.pontos !== row.pontos) return previous.pontos > row.pontos;
    return previous.saldoSets >= row.saldoSets;
  });

  addCheck(
    collector,
    `classificacao-calculo-${groupId}`,
    `Pontos, vitórias, derrotas e saldo corretos no Grupo ${groupId}`,
    failures.length === 0,
    failures.length === 0 ? "Todos os totais conferem com os resultados registrados." : `Divergências: ${failures.join(", ")}.`,
  );

  addCheck(
    collector,
    `classificacao-ordem-${groupId}`,
    `Ordenação da classificação do Grupo ${groupId} está correta`,
    orderedCorrectly,
    orderedCorrectly ? "Ordenada por pontos e saldo de sets." : "Ordem inconsistente com os critérios de desempate.",
  );
}

function validateKnockout(collector: CheckCollector, standingsA: StandingRow[], standingsB: StandingRow[]): void {
  const oitavas = store.bracketMatches.filter((b) => b.round === "oitavas").sort((a, b) => a.order - b.order);

  const expectedPairings: Array<[string, string | null, string | null]> = [
    ["2ºA x 5ºB", positionTeamId(standingsA, 2), positionTeamId(standingsB, 5)],
    ["3ºA x 4ºB", positionTeamId(standingsA, 3), positionTeamId(standingsB, 4)],
    ["4ºA x 3ºB", positionTeamId(standingsA, 4), positionTeamId(standingsB, 3)],
    ["5ºA x 2ºB", positionTeamId(standingsA, 5), positionTeamId(standingsB, 2)],
  ];

  const pairingFailures: string[] = [];
  expectedPairings.forEach(([label, expectedA, expectedB], index) => {
    const bracket = oitavas[index];
    const match = bracket?.matchId ? store.matches.find((m) => m.id === bracket.matchId) : undefined;
    if (!match || match.teamAId !== expectedA || match.teamBId !== expectedB) {
      pairingFailures.push(label);
    }
  });

  addCheck(
    collector,
    "confrontos-cruzados",
    "Confrontos cruzados 2ºA×5ºB, 3ºA×4ºB, 4ºA×3ºB e 5ºA×2ºB",
    pairingFailures.length === 0,
    pairingFailures.length === 0
      ? expectedPairings.map(([label]) => label).join(" · ")
      : `Divergências em: ${pairingFailures.join(", ")}.`,
  );

  const eliminated = [positionTeamId(standingsA, 6), positionTeamId(standingsB, 6)].filter(Boolean) as string[];
  const knockoutTeamIds = new Set(
    store.matches.filter((m) => m.stage === "mata-mata").flatMap((m) => [m.teamAId, m.teamBId]),
  );
  const intruders = eliminated.filter((teamId) => knockoutTeamIds.has(teamId));

  addCheck(
    collector,
    "eliminados-nao-avancaram",
    "Nenhum 6º colocado avançou para o mata-mata",
    intruders.length === 0,
    intruders.length === 0
      ? `Eliminados: ${eliminated.map(teamName).join(" e ")}.`
      : `Duplas eliminadas encontradas no mata-mata: ${intruders.map(teamName).join(", ")}.`,
  );

  const progressionFailures: string[] = [];
  store.bracketMatches.forEach((bracket) => {
    const match = bracket.matchId ? store.matches.find((m) => m.id === bracket.matchId) : undefined;
    if (!match) return;

    ([["slotA", bracket.slotA, match.teamAId], ["slotB", bracket.slotB, match.teamBId]] as const).forEach(
      ([slotName, slot, actualTeamId]) => {
        if (slot.type !== "winner") return;
        const expected = winnerOfBracket(store.bracketMatches.find((b) => b.id === slot.bracketMatchId));
        if (expected && expected !== actualTeamId) {
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

  const semifinals = store.bracketMatches.filter((b) => b.round === "semifinal");
  const semifinalTeamIds = new Set(
    semifinals
      .map((b) => (b.matchId ? store.matches.find((m) => m.id === b.matchId) : undefined))
      .flatMap((m) => (m ? [m.teamAId, m.teamBId] : [])),
  );
  const firstA = positionTeamId(standingsA, 1);
  const firstB = positionTeamId(standingsB, 1);
  const leadersInSemis = Boolean(firstA && firstB && semifinalTeamIds.has(firstA) && semifinalTeamIds.has(firstB));

  addCheck(
    collector,
    "lideres-na-semifinal",
    "1º de cada grupo avançou direto para a semifinal",
    leadersInSemis,
    `${teamName(firstA)} (1ºA) e ${teamName(firstB)} (1ºB).`,
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
 * Executa o campeonato inteiro de forma determinística e devolve o relatório de validação.
 * Todas as etapas usam os serviços reais do projeto — o modo de simulação apenas os orquestra.
 */
export function runFullSimulation(options: SimulationOptions = {}): SimulationReport {
  const seed = options.seed ?? DEFAULT_SIMULATION_SEED;
  const year = options.year ?? CURRENT_SEASON_YEAR;
  const random = createSeededRandom(seed);
  const collector: CheckCollector = { checks: [], warnings: [] };

  // 1-2. Sandbox legado limpo e 12 duplas aprovadas.
  resetSimulation();
  ensureApprovedTeams(collector);

  // 3-6. Sorteio e geração dos confrontos da fase de grupos.
  performDraw(random);

  // 7-8. Resultados simulados válidos; pontos e classificação são calculados pelos serviços reais.
  playPendingMatches("grupos", random);

  // 9-16. Mata-mata: cada rodada gera a próxima ao ser concluída.
  let guard = 0;
  while (store.matches.some((m) => m.stage === "mata-mata" && m.status === "pendente")) {
    if (guard > 10) {
      throw new SimulationError("A progressão do mata-mata não convergiu — possível ciclo na chave.");
    }
    playPendingMatches("mata-mata", random);
    guard += 1;
  }

  // 17-20. Campeão, ranking e histórico.
  const outcome = finalizeTournament(year) ?? findTournamentOutcome();

  const standingsA = computeStandings("A");
  const standingsB = computeStandings("B");

  // 22-25. Validações automáticas.
  addCheck(
    collector,
    "duplas-aprovadas",
    "12 duplas aprovadas participando",
    store.approvedTeams().length === EXPECTED_TEAMS,
    `${store.approvedTeams().length} duplas aprovadas.`,
  );
  validateGroups(collector, standingsA, standingsB);
  validateMatches(collector);
  validateStandingsMath(collector, "A", standingsA);
  validateStandingsMath(collector, "B", standingsB);
  validateKnockout(collector, standingsA, standingsB);
  validateOutcome(collector, outcome);

  const errors = collector.checks.filter((c) => !c.passed && c.severity === "erro").map((c) => `${c.label}: ${c.detail}`);
  const warnings = [
    LEGACY_SIMULATION_WARNING,
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
    groups: [buildGroupSummary("A", standingsA), buildGroupSummary("B", standingsB)],
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
