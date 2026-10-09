import { BRACKET_ROUNDS, KNOCKOUT_PLAN, buildKnockoutView, type BracketMatch, type BracketRound, type GroupId, type KnockoutKey, type KnockoutMatchView, type Match, type MatchResult, type StandingRow, type Team } from "@truco/shared";
import { getTeams } from "../services/teamsService";
import { getMatches } from "../services/matchesService";
import { getBracket, getKnockoutStatus } from "../services/bracketService";
import type { KnockoutStatus } from "@truco/shared";
import { getStandings } from "../services/groupsService";
import { teamLabel } from "./teamHelpers";

export interface KnockoutData {
  status?: KnockoutStatus;
  teams: Team[];
  bracket: BracketMatch[];
  matches: Match[];
  standings: Record<GroupId, StandingRow[]>;
}

/** Tudo o que as telas de mata-mata precisam, numa ida só à API. */
export async function loadKnockoutData(): Promise<KnockoutData> {
  const [teams, bracket, matches, standingsA, standingsB, status] = await Promise.all([
    getTeams(),
    getBracket(),
    getMatches({ stage: "mata-mata" }),
    getStandings("A"),
    getStandings("B"),
    getKnockoutStatus(),
  ]);
  return { teams, bracket, matches, standings: { A: standingsA, B: standingsB }, status };
}

export type KnockoutPhase = "grupos" | BracketRound | "encerrado";

export interface KnockoutSummary {
  view: KnockoutMatchView[];
  /** Fase em disputa agora. */
  phase: KnockoutPhase;
  /** Id do jogo de cada confronto já criado, para lançar o placar direto no chaveamento. */
  matchIds: Partial<Record<KnockoutKey, string>>;
  /** Os confrontos ainda não existem e as duplas mostradas são só as que ocupam cada posição hoje. */
  provisional: boolean;
  /** Fase de grupos encerrada, mas há empate exato esperando a decisão do administrador. */
  tiePending: boolean;
  /** Todos os jogos de grupo têm placar: sem empate a decidir, a repescagem nasce sozinha. */
  groupsComplete: boolean;
}

export function summarizeKnockout({ teams, bracket, matches, standings, status }: KnockoutData): KnockoutSummary {
  const rows = [...standings.A, ...standings.B];
  const groupsStarted = rows.some((row) => row.jogos > 0);
  const generated = bracket.length > 0;
  const groupsComplete = rows.length > 0 && (["A", "B"] as const).every((group) => standings[group].length > 1 && standings[group].every((row) => row.jogos === standings[group].length - 1));

  const view = buildKnockoutView({
    bracket,
    matches,
    teamName: (teamId) => teamLabel(teams, teamId),
    groupOf: (teamId) => teams.find((team) => team.id === teamId)?.groupId,
    // Antes de qualquer jogo a ordem da tabela não diz nada: só as posições aparecem.
    projected: generated || !groupsStarted ? undefined : (group, position) => standings[group].find((row) => row.position === position)?.teamId,
  });

  // KnockoutMatchView não traz o id do jogo: ele vem do chaveamento gravado, pela fase e ordem.
  const matchIds: Partial<Record<KnockoutKey, string>> = {};
  for (const fixture of KNOCKOUT_PLAN) {
    const matchId = bracket.find((item) => item.round === fixture.round && item.order === fixture.order)?.matchId;
    if (matchId && matches.some((match) => match.id === matchId)) matchIds[fixture.key] = matchId;
  }

  const openRound = BRACKET_ROUNDS.find((round) => view.some((match) => match.round === round && !match.played));
  return {
    view,
    matchIds,
    phase: !generated ? "grupos" : (openRound ?? (status?.editionFinished === true ? "encerrado" : "final")),
    provisional: !generated && groupsStarted,
    tiePending: !generated && rows.some((row) => row.tiePending),
    groupsComplete,
  };
}

/**
 * Aviso para quando sobra um reencontro nas quartas. O cruzamento já é o de menos reencontros,
 * então o que aparece aqui é sempre o caso inevitável: os dois vencedores da repescagem
 * saíram do mesmo grupo.
 */
export function quarterfinalRematchNote(view: readonly KnockoutMatchView[]): string | null {
  const rematch = view.find((match) => match.round === "quartas" && match.sameGroup && !match.sideA.provisional && !match.sideB.provisional);
  if (!rematch) return null;
  return `Reencontro inevitável nas quartas: ${rematch.sideA.name} e ${rematch.sideB.name} já se enfrentaram na fase de grupos. Os dois vencedores da repescagem saíram do mesmo grupo, então um deles cai com o 2º colocado desse grupo de qualquer jeito.`;
}

// ---------- Campanha da dupla no mata-mata ----------

const isReady = (match: KnockoutMatchView) => Boolean(match.sideA.name && match.sideB.name && !match.sideA.provisional && !match.sideB.provisional);

/** Texto de quem venceu cada fase: é a fase seguinte que aparece. */
export const ADVANCE_HEADLINE: Record<BracketRound, string> = {
  repescagem: "Classificados para as quartas de final!",
  quartas: "Classificados para a semifinal!",
  semifinal: "Vocês estão na final!",
  final: "Campeões da 5ª edição!",
};

export const CAMPAIGN_OVER_HEADLINE = "Fim da campanha nesta edição";

export interface TeamKnockoutStatus {
  /** O que o último jogo de mata-mata da dupla decidiu. null: ela ainda não jogou no mata-mata. */
  outcome: "advanced" | "champion" | "eliminated" | null;
  headline: string | null;
  /** Complemento do título: o placar que decidiu, ou por que a campanha acabou. */
  detail: string | null;
  /** Jogo pronto e sem placar: é a vez da dupla. */
  turn: { match: KnockoutMatchView; matchId: string | null; opponentName: string } | null;
  /** Dupla já classificada, esperando o adversário sair de outro jogo. */
  waiting: { match: KnockoutMatchView; sentence: string } | null;
}

/**
 * Situação da dupla no mata-mata, lida só do chaveamento: por isso sobrevive ao refresh e vale
 * igual para os dois integrantes. Devolve null antes de o chaveamento existir e para quem não
 * tem dupla.
 */
export function teamKnockoutStatus(summary: KnockoutSummary, data: KnockoutData, teamId: string | null | undefined): TeamKnockoutStatus | null {
  if (!teamId || data.bracket.length === 0) return null;
  const sideOf = (match: KnockoutMatchView) => (!match.sideA.provisional && match.sideA.teamId === teamId ? "A" : !match.sideB.provisional && match.sideB.teamId === teamId ? "B" : null);
  const mine = summary.view.filter((match) => sideOf(match) !== null);

  if (mine.length === 0) {
    // Chaveamento montado sem a dupla: ela terminou o grupo fora das vagas.
    const inGroups = [...data.standings.A, ...data.standings.B].some((row) => row.teamId === teamId);
    return inGroups ? { outcome: "eliminated", headline: CAMPAIGN_OVER_HEADLINE, detail: "A dupla terminou a fase de grupos fora das vagas do mata-mata.", turn: null, waiting: null } : null;
  }

  // A ordem do chaveamento é a ordem das fases: o último jogo disputado é o que vale.
  const last = [...mine].reverse().find((match) => match.played) ?? null;
  const open = mine.find((match) => !match.played) ?? null;
  let outcome: TeamKnockoutStatus["outcome"] = null;
  let headline: string | null = null;
  let detail: string | null = null;
  if (last) {
    const me = sideOf(last) === "A" ? last.sideA : last.sideB;
    const other = sideOf(last) === "A" ? last.sideB : last.sideA;
    outcome = !me.winner ? "eliminated" : last.round === "final" ? "champion" : "advanced";
    headline = me.winner ? ADVANCE_HEADLINE[last.round] : CAMPAIGN_OVER_HEADLINE;
    detail = `${last.label}: ${me.name} ${me.sets} × ${other.sets} ${other.name}`;
    if (last.round === "final" && me.winner && data.status?.editionFinished !== true) {
      outcome = "advanced";
      headline = "Final vencida. Registro do título pendente.";
    }
  }

  let turn: TeamKnockoutStatus["turn"] = null;
  let waiting: TeamKnockoutStatus["waiting"] = null;
  if (outcome !== "eliminated" && outcome !== "champion") {
    if (open && isReady(open)) {
      const other = sideOf(open) === "A" ? open.sideB : open.sideA;
      turn = { match: open, matchId: summary.matchIds[open.key] ?? null, opponentName: other.name! };
    } else if (open) {
      const other = sideOf(open) === "A" ? open.sideB : open.sideA;
      // "Vencedor das Quartas 2" → "Vocês aguardam o vencedor das Quartas 2".
      waiting = { match: open, sentence: `Vocês aguardam o ${other.placeholder.charAt(0).toLowerCase()}${other.placeholder.slice(1)}, ${open.round === "quartas" ? "nas" : "na"} ${open.label}.` };
    } else if (outcome === "advanced" && last?.round === "repescagem") {
      // As quartas só são montadas com as duas repescagens encerradas.
      const pending = summary.view.find((match) => match.round === "repescagem" && !match.played);
      if (pending) waiting = { match: pending, sentence: `Vocês aguardam o fim da ${pending.label} para conhecer o adversário das quartas de final.` };
    }
  }
  return { outcome, headline, detail, turn, waiting };
}

/** Toast do instante do lançamento: o mesmo texto que o chaveamento passa a mostrar. */
export function knockoutResultToast(match: KnockoutMatchView, teamId: string | null | undefined, result: MatchResult): string | null {
  const side = match.sideA.teamId === teamId ? "A" : match.sideB.teamId === teamId ? "B" : null;
  if (!side) return null;
  const won = side === "A" ? result.setsA > result.setsB : result.setsB > result.setsA;
  return won ? ADVANCE_HEADLINE[match.round] : `Resultado registrado. ${CAMPAIGN_OVER_HEADLINE}.`;
}
