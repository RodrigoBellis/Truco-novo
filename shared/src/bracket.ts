import type { GroupId } from "./team.js";

/**
 * Fases do mata-mata da 5ª edição. A repescagem não é "oitavas": são só quatro duplas
 * (3º e 4º de cada grupo) disputando duas vagas nas quartas de final.
 */
export type BracketRound = "repescagem" | "quartas" | "semifinal" | "final";

export const BRACKET_ROUNDS = ["repescagem", "quartas", "semifinal", "final"] as const satisfies readonly BracketRound[];

export const BRACKET_ROUND_LABEL: Record<BracketRound, string> = {
  repescagem: "Repescagem",
  quartas: "Quartas de final",
  semifinal: "Semifinal",
  final: "Final",
};

export type BracketSlotSource =
  | { type: "direct"; teamId: string }
  | { type: "winner"; bracketMatchId: string }
  | { type: "tbd" };

export interface BracketMatch {
  id: string;
  round: BracketRound;
  label: string;
  order: number;
  slotA: BracketSlotSource;
  slotB: BracketSlotSource;
  matchId: string | null;
}

export type KnockoutKey = "R1" | "R2" | "Q1" | "Q2" | "S1" | "S2" | "F";

/** De onde vem cada lado de um confronto: uma posição da fase de grupos ou o vencedor de outro jogo. */
export type KnockoutSlot =
  | { type: "position"; group: GroupId; position: number }
  | { type: "winner"; of: KnockoutKey };

export interface KnockoutFixture {
  key: KnockoutKey;
  round: BracketRound;
  /** Ordem dentro da fase (0 = jogo 1). */
  order: number;
  label: string;
  slotA: KnockoutSlot;
  slotB: KnockoutSlot;
}

const position = (group: GroupId, place: number): KnockoutSlot => ({ type: "position", group, position: place });
const winner = (of: KnockoutKey): KnockoutSlot => ({ type: "winner", of });

/**
 * Chaveamento oficial: 10 duplas → 8 classificadas → 6 após a repescagem → 4 após as quartas
 * → 2 após as semifinais → campeão.
 *
 * - Repescagem 1: 3º A × 4º B · Repescagem 2: 3º B × 4º A
 * - Quartas 1: 2º A × um vencedor da repescagem · Quartas 2: 2º B × o outro vencedor
 * - Semifinal 1: 1º A × vencedor das Quartas 2 · Semifinal 2: 1º B × vencedor das Quartas 1
 *
 * Quem enfrenta quem nas quartas só é decidido quando as duas repescagens terminam
 * (decideQuarterfinalPairing): cada 2º colocado pega, sempre que possível, um vencedor que
 * veio do OUTRO grupo. O que está escrito abaixo para as quartas é o cruzamento padrão,
 * usado quando ele já evita os reencontros ou quando trocar não melhora nada.
 */
export const KNOCKOUT_PLAN: readonly KnockoutFixture[] = [
  { key: "R1", round: "repescagem", order: 0, label: "Repescagem 1", slotA: position("A", 3), slotB: position("B", 4) },
  { key: "R2", round: "repescagem", order: 1, label: "Repescagem 2", slotA: position("B", 3), slotB: position("A", 4) },
  { key: "Q1", round: "quartas", order: 0, label: "Quartas 1", slotA: position("A", 2), slotB: winner("R2") },
  { key: "Q2", round: "quartas", order: 1, label: "Quartas 2", slotA: position("B", 2), slotB: winner("R1") },
  { key: "S1", round: "semifinal", order: 0, label: "Semifinal 1", slotA: position("A", 1), slotB: winner("Q2") },
  { key: "S2", round: "semifinal", order: 1, label: "Semifinal 2", slotA: position("B", 1), slotB: winner("Q1") },
  { key: "F", round: "final", order: 0, label: "Final", slotA: winner("S1"), slotB: winner("S2") },
];

const winnerLabel = (round: BracketRound, label: string) => `Vencedor ${round === "quartas" ? "das" : "da"} ${label}`;

/**
 * Texto de um lado ainda sem dupla definida: "3º do Grupo A", "Vencedor das Quartas 2".
 * Para as quartas o texto é "Vencedor da repescagem", sem número: qual dos dois vencedores
 * cai em cada jogo depende do resultado das duas repescagens.
 */
export function describeKnockoutSlot(slot: KnockoutSlot): string {
  if (slot.type === "position") return `${slot.position}º do Grupo ${slot.group}`;
  const source = KNOCKOUT_PLAN.find((fixture) => fixture.key === slot.of)!;
  return source.round === "repescagem" ? "Vencedor da repescagem" : winnerLabel(source.round, source.label);
}

/**
 * Monta as linhas do mata-mata a partir das classificações finais. teamAt devolve a dupla de
 * uma posição; newId gera o id de cada confronto. Lança RangeError se faltar alguma posição.
 */
export function buildKnockoutBracket(teamAt: (group: GroupId, position: number) => string | null | undefined, newId: () => string): BracketMatch[] {
  const ids = new Map<KnockoutKey, string>(KNOCKOUT_PLAN.map((fixture) => [fixture.key, newId()]));
  const resolve = (slot: KnockoutSlot): BracketSlotSource => {
    if (slot.type === "winner") return { type: "winner", bracketMatchId: ids.get(slot.of)! };
    const teamId = teamAt(slot.group, slot.position);
    if (!teamId) throw new RangeError(`Posição ${slot.position} do Grupo ${slot.group} não encontrada.`);
    return { type: "direct", teamId };
  };
  return KNOCKOUT_PLAN.map((fixture) => ({
    id: ids.get(fixture.key)!,
    round: fixture.round,
    label: fixture.label,
    order: fixture.order,
    slotA: resolve(fixture.slotA),
    slotB: resolve(fixture.slotB),
    matchId: null,
  }));
}

// ---------- Quartas de final: evitar reencontro da fase de grupos ----------

export interface QuarterfinalPairing {
  /** true: Quartas 1 recebe o vencedor da Repescagem 1 (e Quartas 2 o da Repescagem 2), o contrário do padrão. */
  swapped: boolean;
  /** Confrontos do mesmo grupo que restaram nas quartas (0 ou 1). */
  rematches: number;
  /** Reencontros que o cruzamento padrão teria e este não tem (0 ou 2). */
  avoided: number;
  /** Os dois vencedores da repescagem são do mesmo grupo: um deles enfrenta o 2º do próprio grupo de qualquer jeito. */
  inevitable: boolean;
}

/**
 * Escolhe o cruzamento das quartas com menos reencontros, a partir do grupo de origem de cada
 * vencedor da repescagem (R1 = 3º A × 4º B, R2 = 3º B × 4º A).
 *
 * - Vencem 3º A e 3º B: padrão (2º A × 3º B, 2º B × 3º A) — nenhum reencontro.
 * - Vencem 4º B e 4º A: troca (2º A × 4º B, 2º B × 4º A) — o padrão teria dois reencontros.
 * - Os dois vencedores são do mesmo grupo: um reencontro é inevitável; fica o padrão, que põe
 *   o 2º colocado desse grupo contra o 4º (e não contra o 3º) do próprio grupo.
 */
export function decideQuarterfinalPairing(groupOfWinnerR1: GroupId, groupOfWinnerR2: GroupId): QuarterfinalPairing {
  // Quartas 1 tem o 2º A; Quartas 2 tem o 2º B.
  const standard = (groupOfWinnerR2 === "A" ? 1 : 0) + (groupOfWinnerR1 === "B" ? 1 : 0);
  const alternative = (groupOfWinnerR1 === "A" ? 1 : 0) + (groupOfWinnerR2 === "B" ? 1 : 0);
  const swapped = alternative < standard;
  const rematches = Math.min(standard, alternative);
  return { swapped, rematches, avoided: standard - rematches, inevitable: rematches > 0 };
}

type PlayedMatch = { id: string; teamAId: string; teamBId: string; result: { setsA: number; setsB: number } | null };

const entry = (bracket: readonly BracketMatch[], round: BracketRound, order: number) => bracket.find((item) => item.round === round && item.order === order);

function winnerTeam(bracketMatch: BracketMatch | undefined, matches: readonly PlayedMatch[]): string | null {
  const match = bracketMatch?.matchId ? matches.find((item) => item.id === bracketMatch.matchId) : undefined;
  if (!match?.result) return null;
  return match.result.setsA > match.result.setsB ? match.teamAId : match.teamBId;
}

export interface QuarterfinalSettlement {
  pairing: QuarterfinalPairing;
  /** De qual repescagem vem o adversário do 2º colocado em cada jogo das quartas. */
  slots: Array<{ bracketMatchId: string; slotB: BracketSlotSource }>;
}

/**
 * Com as duas repescagens encerradas, devolve o cruzamento das quartas a gravar. Devolve null
 * enquanto faltar resultado de repescagem (as quartas ainda não podem ser montadas) ou se o
 * chaveamento não tiver as quatro partidas esperadas.
 */
export function settleQuarterfinals(bracket: readonly BracketMatch[], matches: readonly PlayedMatch[], groupOf: (teamId: string) => GroupId | null | undefined): QuarterfinalSettlement | null {
  const r1 = entry(bracket, "repescagem", 0);
  const r2 = entry(bracket, "repescagem", 1);
  const q1 = entry(bracket, "quartas", 0);
  const q2 = entry(bracket, "quartas", 1);
  const winner1 = winnerTeam(r1, matches);
  const winner2 = winnerTeam(r2, matches);
  if (!r1 || !r2 || !q1 || !q2 || !winner1 || !winner2) return null;
  const group1 = groupOf(winner1);
  const group2 = groupOf(winner2);
  if (!group1 || !group2) return null;

  const pairing = decideQuarterfinalPairing(group1, group2);
  const fromR1: BracketSlotSource = { type: "winner", bracketMatchId: r1.id };
  const fromR2: BracketSlotSource = { type: "winner", bracketMatchId: r2.id };
  return {
    pairing,
    slots: [
      { bracketMatchId: q1.id, slotB: pairing.swapped ? fromR1 : fromR2 },
      { bracketMatchId: q2.id, slotB: pairing.swapped ? fromR2 : fromR1 },
    ],
  };
}

// ---------- Visão do chaveamento para as telas ----------

/** Um lado de um confronto do mata-mata, pronto para a tela. */
export interface KnockoutSideView {
  teamId: string | null;
  name: string | null;
  /** O que mostrar enquanto a dupla não está definida: "3º do Grupo A", "Vencedor das Quartas 1". */
  placeholder: string;
  /** Dupla que ocupa a posição hoje, com a fase de grupos ainda em andamento. Não é classificação garantida. */
  provisional: boolean;
  sets: number | null;
  winner: boolean;
}

export interface KnockoutMatchView {
  key: KnockoutKey;
  round: BracketRound;
  label: string;
  sideA: KnockoutSideView;
  sideB: KnockoutSideView;
  played: boolean;
  /** As duas duplas já definidas vieram do mesmo grupo: reencontro da fase de grupos. */
  sameGroup: boolean;
}

export interface KnockoutViewInput {
  /** Confrontos já gerados (vazio antes do fim da fase de grupos). */
  bracket: readonly BracketMatch[];
  matches: readonly PlayedMatch[];
  teamName: (teamId: string) => string | undefined;
  /** Ocupante atual de uma posição, para mostrar o chaveamento provisório antes de ele ser gerado. */
  projected?: (group: GroupId, position: number) => string | null | undefined;
  /** Grupo de origem de cada dupla, para sinalizar reencontros. */
  groupOf?: (teamId: string) => GroupId | null | undefined;
}

/**
 * Junta o plano oficial, os confrontos gerados e os placares numa lista única, na ordem do
 * chaveamento. O campeonato real, o simulador e as telas leem o mata-mata por aqui.
 */
export function buildKnockoutView({ bracket, matches, teamName, projected, groupOf }: KnockoutViewInput): KnockoutMatchView[] {
  return KNOCKOUT_PLAN.map((fixture) => {
    const generated = entry(bracket, fixture.round, fixture.order);
    const match = generated?.matchId ? matches.find((item) => item.id === generated.matchId) : undefined;
    const result = match?.result ?? null;

    const side = (which: "A" | "B"): KnockoutSideView => {
      const planSlot = which === "A" ? fixture.slotA : fixture.slotB;
      const generatedSlot = which === "A" ? generated?.slotA : generated?.slotB;
      let teamId = (which === "A" ? match?.teamAId : match?.teamBId) ?? (generatedSlot?.type === "direct" ? generatedSlot.teamId : null);
      let provisional = false;
      if (!teamId && !generated && planSlot.type === "position" && projected) {
        teamId = projected(planSlot.group, planSlot.position) ?? null;
        provisional = teamId !== null;
      }
      // Com o jogo já montado, a origem é a que ficou gravada (nas quartas ela pode ter sido trocada).
      const source = match && generatedSlot?.type === "winner" ? bracket.find((item) => item.id === generatedSlot.bracketMatchId) : undefined;
      const sets = result ? (which === "A" ? result.setsA : result.setsB) : null;
      const against = result ? (which === "A" ? result.setsB : result.setsA) : null;
      return {
        teamId,
        name: teamId ? (teamName(teamId) ?? null) : null,
        placeholder: source ? winnerLabel(source.round, source.label) : describeKnockoutSlot(planSlot),
        provisional,
        sets,
        winner: sets !== null && against !== null && sets > against,
      };
    };

    const sideA = side("A");
    const sideB = side("B");
    const groupA = sideA.teamId && groupOf ? groupOf(sideA.teamId) : null;
    const groupB = sideB.teamId && groupOf ? groupOf(sideB.teamId) : null;
    return { key: fixture.key, round: fixture.round, label: fixture.label, sideA, sideB, played: result !== null, sameGroup: Boolean(groupA && groupB && groupA === groupB) };
  });
}

/** Campeão: vencedor da final, quando ela já foi disputada. */
export function knockoutChampion(view: readonly KnockoutMatchView[]): KnockoutSideView | null {
  const final = view.find((item) => item.round === "final");
  if (!final?.played) return null;
  return final.sideA.winner ? final.sideA : final.sideB;
}
