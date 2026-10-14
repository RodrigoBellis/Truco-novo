import { EDITION_GROUP_IDS, type GroupId } from "./team.js";

/**
 * Fases do mata-mata da 5ª edição (formato de 14/10/2026): quartas, semifinais, disputa de 3º
 * lugar e final.
 */
export type BracketRound = "quartas" | "semifinal" | "terceiro" | "final";

export const BRACKET_ROUNDS = ["quartas", "semifinal", "terceiro", "final"] as const satisfies readonly BracketRound[];

export const BRACKET_ROUND_LABEL: Record<BracketRound, string> = {
  quartas: "Quartas de final",
  semifinal: "Semifinal",
  terceiro: "Disputa de 3º lugar",
  final: "Final",
};

/** Premiação por dupla, em reais. */
export const EDITION_PRIZES = { campeao: 400, vice: 200, terceiro: 100 } as const;

export type BracketSlotSource =
  | { type: "direct"; teamId: string }
  | { type: "winner"; bracketMatchId: string }
  | { type: "loser"; bracketMatchId: string }
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

export type KnockoutKey = "Q1" | "Q2" | "S1" | "S2" | "T" | "F";

/** De onde vem cada lado de um confronto: uma posição da fase de grupos, ou o vencedor/perdedor de outro jogo. */
export type KnockoutSlot =
  | { type: "position"; group: GroupId; position: number }
  | { type: "winner"; of: KnockoutKey }
  | { type: "loser"; of: KnockoutKey };

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
const loser = (of: KnockoutKey): KnockoutSlot => ({ type: "loser", of });

/**
 * Chaveamento oficial: 7 duplas → 6 classificadas (o 7º sai) → 4 após as quartas → final e
 * disputa de 3º lugar.
 *
 * - Quartas 1: 3º × 6º · Quartas 2: 4º × 5º
 * - Semifinal 1: 1º × vencedor das Quartas 2 · Semifinal 2: 2º × vencedor das Quartas 1
 * - Disputa de 3º lugar: perdedores das semifinais · Final: vencedores das semifinais
 *
 * 27 jogos no total: 21 do grupo + 2 quartas + 2 semifinais + 3º lugar + final.
 */
export const KNOCKOUT_PLAN: readonly KnockoutFixture[] = [
  { key: "Q1", round: "quartas", order: 0, label: "Quartas 1", slotA: position("A", 3), slotB: position("A", 6) },
  { key: "Q2", round: "quartas", order: 1, label: "Quartas 2", slotA: position("A", 4), slotB: position("A", 5) },
  { key: "S1", round: "semifinal", order: 0, label: "Semifinal 1", slotA: position("A", 1), slotB: winner("Q2") },
  { key: "S2", round: "semifinal", order: 1, label: "Semifinal 2", slotA: position("A", 2), slotB: winner("Q1") },
  { key: "T", round: "terceiro", order: 0, label: "Disputa de 3º lugar", slotA: loser("S1"), slotB: loser("S2") },
  { key: "F", round: "final", order: 0, label: "Final", slotA: winner("S1"), slotB: winner("S2") },
];

export const KNOCKOUT_MATCH_COUNT = KNOCKOUT_PLAN.length;

const article = (round: BracketRound) => (round === "quartas" ? "das" : "da");
const winnerLabel = (round: BracketRound, label: string) => `Vencedor ${article(round)} ${label}`;
const loserLabel = (round: BracketRound, label: string) => `Perdedor ${article(round)} ${label}`;

/** Texto de um lado ainda sem dupla definida: "3º colocado", "Vencedor das Quartas 2", "Perdedor da Semifinal 1". */
export function describeKnockoutSlot(slot: KnockoutSlot): string {
  if (slot.type === "position") return `${slot.position}º colocado`;
  const source = KNOCKOUT_PLAN.find((fixture) => fixture.key === slot.of)!;
  return slot.type === "winner" ? winnerLabel(source.round, source.label) : loserLabel(source.round, source.label);
}

/**
 * Monta as linhas do mata-mata a partir da classificação final. teamAt devolve a dupla de
 * uma posição; newId gera o id de cada confronto. Lança RangeError se faltar alguma posição.
 */
export function buildKnockoutBracket(teamAt: (group: GroupId, position: number) => string | null | undefined, newId: () => string): BracketMatch[] {
  const ids = new Map<KnockoutKey, string>(KNOCKOUT_PLAN.map((fixture) => [fixture.key, newId()]));
  const resolve = (slot: KnockoutSlot): BracketSlotSource => {
    if (slot.type === "winner" || slot.type === "loser") return { type: slot.type, bracketMatchId: ids.get(slot.of)! };
    const teamId = teamAt(slot.group, slot.position);
    if (!teamId) throw new RangeError(`Posição ${slot.position} da classificação não encontrada.`);
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

type PlayedMatch = { id: string; teamAId: string; teamBId: string; result: { setsA: number; setsB: number } | null };

const entry = (bracket: readonly BracketMatch[], round: BracketRound, order: number) => bracket.find((item) => item.round === round && item.order === order);

// ---------- Visão do chaveamento para as telas ----------

/** Um lado de um confronto do mata-mata, pronto para a tela. */
export interface KnockoutSideView {
  teamId: string | null;
  name: string | null;
  /** O que mostrar enquanto a dupla não está definida: "3º colocado", "Vencedor das Quartas 1". */
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
      const source = match && (generatedSlot?.type === "winner" || generatedSlot?.type === "loser") ? bracket.find((item) => item.id === generatedSlot.bracketMatchId) : undefined;
      const sets = result ? (which === "A" ? result.setsA : result.setsB) : null;
      const against = result ? (which === "A" ? result.setsB : result.setsA) : null;
      return {
        teamId,
        name: teamId ? (teamName(teamId) ?? null) : null,
        placeholder: source ? (generatedSlot?.type === "loser" ? loserLabel : winnerLabel)(source.round, source.label) : describeKnockoutSlot(planSlot),
        provisional,
        sets,
        winner: sets !== null && against !== null && sets > against,
      };
    };

    const sideA = side("A");
    const sideB = side("B");
    const groupA = sideA.teamId && groupOf ? groupOf(sideA.teamId) : null;
    const groupB = sideB.teamId && groupOf ? groupOf(sideB.teamId) : null;
    return { key: fixture.key, round: fixture.round, label: fixture.label, sideA, sideB, played: result !== null, sameGroup: EDITION_GROUP_IDS.length > 1 && Boolean(groupA && groupB && groupA === groupB) };
  });
}

/** Campeão: vencedor da final, quando ela já foi disputada. */
export function knockoutChampion(view: readonly KnockoutMatchView[]): KnockoutSideView | null {
  const final = view.find((item) => item.round === "final");
  if (!final?.played) return null;
  return final.sideA.winner ? final.sideA : final.sideB;
}

/** Terceiro colocado: vencedor da disputa de 3º lugar, quando ela já foi disputada. */
export function knockoutThirdPlace(view: readonly KnockoutMatchView[]): KnockoutSideView | null {
  const third = view.find((item) => item.round === "terceiro");
  if (!third?.played) return null;
  return third.sideA.winner ? third.sideA : third.sideB;
}
