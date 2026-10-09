import { groupStageOutcome, planKnockoutSync, settleQuarterfinals, type EditionChampionRecord, type KnockoutStep, type Match, type QuarterfinalPairing } from "@truco/shared";
import { store } from "../../data/simulationStore.js";
import { nextId } from "../../utils/id.js";
import { computeStandings } from "./standingsService.js";

export class BracketError extends Error {}

/** Cruzamento escolhido para as quartas na simulação em curso (null até as repescagens terminarem). */
export let quarterfinalPairing: QuarterfinalPairing | null = null;

/** Campeão registrado pelo plano na simulação em curso (o histórico do simulador é gravado à parte). */
let champion: EditionChampionRecord | null = null;

const knockoutMatches = () => store.matches.filter((match) => match.stage === "mata-mata");

function apply(step: KnockoutStep): void {
  if (step.type === "clear-knockout") {
    store.bracketMatches = [];
    store.matches = store.matches.filter((match) => match.stage !== "mata-mata" || match.result);
  } else if (step.type === "create-bracket") {
    store.bracketMatches = step.rows;
  } else if (step.type === "set-quarter-source") {
    store.bracketMatches.find((item) => item.id === step.bracketMatchId)!.slotB = { type: "winner", bracketMatchId: step.sourceBracketMatchId };
  } else if (step.type === "create-match") {
    const match: Match = {
      id: nextId("match"), championshipId: "simulation", stage: "mata-mata", round: step.round, order: step.order, groupId: null,
      teamAId: step.teamAId, teamBId: step.teamBId, result: null, status: "pendente", tableNumber: null, blockNumber: null, queuePosition: null,
    };
    store.matches.push(match);
    store.bracketMatches.find((item) => item.id === step.bracketMatchId)!.matchId = match.id;
  } else if (step.type === "link-match") {
    store.bracketMatches.find((item) => item.id === step.bracketMatchId)!.matchId = step.matchId;
  } else if (step.type === "delete-match") {
    store.matches = store.matches.filter((match) => match.id !== step.matchId);
    store.bracketMatches.forEach((item) => { if (item.matchId === step.matchId) item.matchId = null; });
  } else if (step.type === "set-match-team") {
    const match = store.matches.find((item) => item.id === step.matchId)!;
    if (step.side === "A") match.teamAId = step.teamId; else match.teamBId = step.teamId;
  } else if (step.type === "record-champion") {
    champion = { championTeamId: step.championTeamId, runnerUpTeamId: step.runnerUpTeamId, finalResult: step.finalResult };
  } else {
    store.currentPhase = step.phase;
  }
}

/**
 * Mesma rotina do campeonato real: aplica o plano de @truco/shared (planKnockoutSync) até não
 * sobrar passo. Gera o chaveamento quando a fase de grupos fecha sem empate pendente e abre
 * cada fase quando a anterior termina.
 */
export function resolveBracketProgression(): void {
  if (store.bracketMatches.length === 0 && knockoutMatches().length === 0) champion = null;
  const groupOf = (teamId: string) => store.getTeam(teamId)?.groupId;
  for (let pass = 0; pass < 12; pass += 1) {
    const plan = planKnockoutSync(
      { standings: { A: computeStandings("A"), B: computeStandings("B") }, bracket: store.bracketMatches, knockoutMatches: knockoutMatches(), groupOf, phase: store.currentPhase, champion },
      () => nextId("bracket"),
    );
    if (plan.steps.length === 0) {
      quarterfinalPairing = settleQuarterfinals(store.bracketMatches, store.matches, groupOf)?.pairing ?? null;
      return;
    }
    plan.steps.forEach(apply);
  }
  throw new BracketError("A progressão do mata-mata não convergiu.");
}

/** Confere se a classificação está definida e sincroniza; lança BracketError se ainda não dá para gerar. */
export function generateBracket(): void {
  const outcome = groupStageOutcome({ A: computeStandings("A"), B: computeStandings("B") });
  if (outcome.status === "em-andamento") throw new BracketError("A fase de grupos precisa estar concluída em ambos os grupos.");
  if (outcome.status === "empate-pendente") throw new BracketError(`Há empate sem critério de desempate no Grupo ${outcome.pendingTieGroups.join(" e no Grupo ")}.`);
  resolveBracketProgression();
}
