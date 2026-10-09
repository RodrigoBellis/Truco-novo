import { BRACKET_ROUNDS, buildKnockoutView, type BracketMatch, type BracketRound, type GroupId, type KnockoutMatchView, type Match, type StandingRow, type Team } from "@truco/shared";
import { getTeams } from "../services/teamsService";
import { getMatches } from "../services/matchesService";
import { getBracket } from "../services/bracketService";
import { getStandings } from "../services/groupsService";
import { teamLabel } from "./teamHelpers";

export interface KnockoutData {
  teams: Team[];
  bracket: BracketMatch[];
  matches: Match[];
  standings: Record<GroupId, StandingRow[]>;
}

/** Tudo o que as telas de mata-mata precisam, numa ida só à API. */
export async function loadKnockoutData(): Promise<KnockoutData> {
  const [teams, bracket, matches, standingsA, standingsB] = await Promise.all([
    getTeams(),
    getBracket(),
    getMatches({ stage: "mata-mata" }),
    getStandings("A"),
    getStandings("B"),
  ]);
  return { teams, bracket, matches, standings: { A: standingsA, B: standingsB } };
}

export type KnockoutPhase = "grupos" | BracketRound | "encerrado";

export interface KnockoutSummary {
  view: KnockoutMatchView[];
  /** Fase em disputa agora. */
  phase: KnockoutPhase;
  /** O mata-mata ainda não foi gerado e as duplas mostradas são só as que ocupam cada posição hoje. */
  provisional: boolean;
  /** Fase de grupos encerrada, mas há empate exato esperando a decisão do administrador. */
  tiePending: boolean;
  /** Todos os jogos de grupo têm placar. O mata-mata ainda depende de o administrador gerá-lo. */
  groupsComplete: boolean;
}

export function summarizeKnockout({ teams, bracket, matches, standings }: KnockoutData): KnockoutSummary {
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

  const openRound = BRACKET_ROUNDS.find((round) => view.some((match) => match.round === round && !match.played));
  return {
    view,
    phase: !generated ? "grupos" : (openRound ?? "encerrado"),
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
