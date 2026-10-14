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
  groupDisplayName,
  knockoutThirdPlace,
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
import { generateBracket } from "./simulation/bracketService.js";
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
  (["A"] as const).forEach((groupId) => {
    pendingTieClusters(computeStandings(groupId)).forEach((cluster) => {
      const positions = cluster.map((row) => row.position).sort((a, b) => a - b);
      const decided = shuffle(cluster, random);
      decided.forEach((row, index) => {
        store.standingOverrides[groupId].push({ teamId: row.teamId, position: positions[index] });
      });
      collector.tieResolved.add(groupId);
      collector.warnings.push(
        `${groupDisplayName(groupId)}: empate exato entre ${cluster.map((row) => teamName(row.teamId)).join(", ")} ` +
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
    name: groupDisplayName(groupId),
    teamNames: standings.map((row) => row.teamName),
    standings,
    qualifiedDirect: namesIn("semifinal"),
    qualifiedQuarter: namesIn("quartas"),
    eliminated: namesIn("eliminado")[0] ?? null,
    tieResolvedManually: collector.tieResolved.has(groupId),
  };
}

function validateGroups(collector: CheckCollector, standings: StandingRow[]): void {
  const group = store.getGroup("A");

  addCheck(
    collector,
    "grupos-tamanho",
    `O grupo único possui exatamente ${TEAMS_PER_GROUP} duplas`,
    group.teamIds.length === TEAMS_PER_GROUP,
    `${groupDisplayName("A")}: ${group.teamIds.length} duplas.`,
  );

  const uniqueAssigned = new Set(group.teamIds);
  addCheck(
    collector,
    "duplas-sem-duplicidade",
    "Nenhuma dupla foi duplicada no grupo",
    uniqueAssigned.size === group.teamIds.length,
    `${group.teamIds.length} alocações para ${uniqueAssigned.size} duplas distintas.`,
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

  addCheck(
    collector,
    "classificacao-completa",
    `Classificação calculada para as ${EDITION_TEAM_COUNT} duplas`,
    standings.length === TEAMS_PER_GROUP,
    `${standings.length} linhas.`,
  );

  const zones = standings.map((row) => qualificationForPosition(row.position, standings.length)).join(", ");
  const expectedZones = "semifinal, semifinal, quartas, quartas, quartas, quartas, eliminado";
  addCheck(
    collector,
    "zonas-por-posicao",
    "1º e 2º semifinal, 3º a 6º quartas, 7º eliminado",
    zones === expectedZones,
    zones,
  );

  const stillPending = standings.filter((row) => row.tiePending);
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
    groupMatches.length === MATCHES_PER_GROUP,
    `${groupMatches.length} jogos gerados (esperado ${MATCHES_PER_GROUP}).`,
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
    `Mata-mata com ${KNOCKOUT_MATCHES} confrontos (2 quartas + 2 semifinais + 3º lugar + final)`,
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
    `Pontos, vitórias, 2x0, confronto direto, derrotas e saldo corretos no ${groupDisplayName(groupId)}`,
    failures.length === 0,
    failures.length === 0 ? "Todos os totais conferem com os resultados registrados." : `Divergências: ${failures.join(", ")}.`,
  );

  addCheck(
    collector,
    `classificacao-ordem-${groupId}`,
    `Ordenação da classificação do ${groupDisplayName(groupId)} está correta`,
    orderedCorrectly,
    orderedCorrectly ? "Ordenada por pontos, vitórias, vitórias por 2x0, confronto direto e saldo de quedas." : "Ordem inconsistente com os critérios de desempate.",
  );
}

function validateKnockout(collector: CheckCollector, standings: StandingRow[], view: KnockoutMatchView[]): void {
  const fixture = (key: KnockoutKey) => view.find((item) => item.key === key)!;
  const winnerOf = (key: KnockoutKey) => {
    const item = fixture(key);
    return item.sideA.winner ? item.sideA.teamId : item.sideB.winner ? item.sideB.teamId : null;
  };
  const loserOf = (key: KnockoutKey) => {
    const item = fixture(key);
    return item.sideA.winner ? item.sideB.teamId : item.sideB.winner ? item.sideA.teamId : null;
  };
  const at = (position: number) => positionTeamId(standings, position);

  // Chaveamento recalculado por fora, direto da classificação final.
  const expected: Array<[KnockoutKey, string, string | null, string | null]> = [
    ["Q1", "Quartas 1: 3º × 6º", at(3), at(6)],
    ["Q2", "Quartas 2: 4º × 5º", at(4), at(5)],
    ["S1", "Semifinal 1: 1º × vencedor das Quartas 2", at(1), winnerOf("Q2")],
    ["S2", "Semifinal 2: 2º × vencedor das Quartas 1", at(2), winnerOf("Q1")],
    ["T", "Disputa de 3º lugar: perdedores das semifinais", loserOf("S1"), loserOf("S2")],
    ["F", "Final: vencedores das semifinais", winnerOf("S1"), winnerOf("S2")],
  ];

  const byRound: Array<[string, string, KnockoutKey[]]> = [
    ["quartas-cruzadas", "Quartas: 3º × 6º e 4º × 5º", ["Q1", "Q2"]],
    ["semifinais-com-lideres", "Semifinais: 1º × vencedor da Q2 e 2º × vencedor da Q1", ["S1", "S2"]],
    ["terceiro-com-perdedores", "Disputa de 3º lugar reúne os perdedores das semifinais", ["T"]],
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

  const teamsIn = (keys: KnockoutKey[]) => new Set(keys.flatMap((key) => [fixture(key).sideA.teamId, fixture(key).sideB.teamId]));
  const eliminated = at(TEAMS_PER_GROUP);
  const everyone = teamsIn(KNOCKOUT_PLAN.map((item) => item.key));
  addCheck(
    collector,
    "eliminados-nao-avancaram",
    `O ${TEAMS_PER_GROUP}º colocado não avançou para o mata-mata`,
    Boolean(eliminated) && !everyone.has(eliminated),
    `Eliminado: ${teamName(eliminated)}.`,
  );

  // 1º e 2º entram direto na semifinal: não jogam as quartas.
  const leaders = [at(1), at(2)];
  const quarters = teamsIn(["Q1", "Q2"]);
  addCheck(
    collector,
    "entradas-diretas",
    "1º e 2º colocados só jogam a partir da semifinal",
    leaders.every((teamId) => teamId && !quarters.has(teamId)),
    `Direto na semifinal: ${leaders.map(teamName).join(" e ")}.`,
  );

  const progressionFailures: string[] = [];
  store.bracketMatches.forEach((bracket) => {
    const match = bracket.matchId ? store.matches.find((m) => m.id === bracket.matchId) : undefined;
    if (!match) return;

    ([["slotA", bracket.slotA, match.teamAId], ["slotB", bracket.slotB, match.teamBId]] as const).forEach(
      ([slotName, slot, actualTeamId]) => {
        if (slot.type !== "winner" && slot.type !== "loser") return;
        const source = store.bracketMatches.find((b) => b.id === slot.bracketMatchId);
        const sourceMatch = source?.matchId ? store.matches.find((m) => m.id === source.matchId) : undefined;
        const won = winnerOfBracket(source);
        const expectedTeam = slot.type === "winner" ? won : won && sourceMatch ? (won === sourceMatch.teamAId ? sourceMatch.teamBId : sourceMatch.teamAId) : null;
        if (expectedTeam && expectedTeam !== actualTeamId) {
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
      ? "Todas as chaves receberam o vencedor (ou, no 3º lugar, o perdedor) da fase anterior."
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
    "Campeonato encerrado só com final e disputa de 3º lugar decididas",
    store.currentPhase === "Campeonato Finalizado" && store.matches.filter((m) => m.stage === "mata-mata").every((m) => m.result),
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

  // 1. Ambiente limpo e 7 duplas aprovadas.
  resetSimulation();
  ensureApprovedTeams(collector);

  // 2. Sorteio e confrontos da fase de grupos.
  performDraw(random);

  // 3. Resultados da fase de grupos; a classificação sai da regra compartilhada.
  playPendingMatches("grupos", random);

  // 4. Empate exato: decisão simulada do administrador; só então o mata-mata é gerado.
  resolvePendingTies(random, collector);
  if (store.bracketMatches.length === 0) generateBracket();

  // 5. Quartas → semifinais → 3º lugar e final: cada fase concluída abre a seguinte.
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

  const standings = computeStandings("A");
  const knockout = buildKnockoutView({
    bracket: store.bracketMatches,
    matches: store.matches,
    teamName: (teamId) => store.getTeam(teamId)?.name,
    groupOf: (teamId) => store.getTeam(teamId)?.groupId,
  });
  const thirdPlace = knockoutThirdPlace(knockout);
  const thirdMatch = knockout.find((item) => item.round === "terceiro");

  // 7. Validações automáticas.
  addCheck(
    collector,
    "duplas-aprovadas",
    `${EDITION_TEAM_COUNT} duplas aprovadas participando`,
    store.approvedTeams().length === EDITION_TEAM_COUNT,
    `${store.approvedTeams().length} duplas aprovadas.`,
  );
  validateGroups(collector, standings);
  validateMatches(collector);
  validateStandingsMath(collector, "A", standings);
  validateKnockout(collector, standings, knockout);
  addCheck(
    collector,
    "terceiro-definido",
    "Terceiro colocado definido pela disputa de 3º lugar",
    Boolean(thirdPlace?.teamId),
    thirdPlace ? `3º lugar: ${thirdPlace.name}.` : "A disputa de 3º lugar não teve vencedor.",
  );
  addCheck(
    collector,
    "total-de-jogos",
    `${MATCHES_PER_GROUP + KNOCKOUT_MATCHES} partidas no campeonato (${MATCHES_PER_GROUP} do grupo + ${KNOCKOUT_MATCHES} do mata-mata)`,
    store.matches.length === MATCHES_PER_GROUP + KNOCKOUT_MATCHES,
    `${store.matches.length} partidas.`,
  );
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
    groups: [buildGroupSummary("A", standings, collector)],
    knockout,
    groupMatches,
    knockoutMatches,
    totalMatches: groupMatches + knockoutMatches,
    final: {
      championTeamName: outcome?.championTeam.name ?? null,
      runnerUpTeamName: outcome?.runnerUpTeam.name ?? null,
      finalScore: outcome?.finalScore ?? null,
      thirdPlaceTeamName: thirdPlace?.name ?? null,
      thirdPlaceScore: thirdMatch?.played ? `${Math.max(thirdMatch.sideA.sets ?? 0, thirdMatch.sideB.sets ?? 0)}x${Math.min(thirdMatch.sideA.sets ?? 0, thirdMatch.sideB.sets ?? 0)}` : null,
    },
    checks: collector.checks,
    errors,
    status: errors.length === 0 ? "SIMULAÇÃO APROVADA" : "SIMULAÇÃO REPROVADA",
  };
}
