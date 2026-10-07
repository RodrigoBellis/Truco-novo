import { initials } from "../../utils/format";
import { teamHue } from "../../utils/teamColor";

/** Naipes do baralho. Os vermelhos ganham o laranja da marca; os pretos, o azul. */
const SUITS = [
  { symbol: "♣", name: "paus", red: false },
  { symbol: "♥", name: "copas", red: true },
  { symbol: "♠", name: "espadas", red: false },
  { symbol: "♦", name: "ouros", red: true },
] as const;

/** Valores do baralho de truco (sem 8, 9 e 10), do mais forte ao mais fraco. */
const RANKS = ["3", "2", "A", "K", "J", "Q", "7", "6", "5", "4"] as const;

/** Manilhas fixas do truco: a carta do jogador ganha o apelido quando cai numa delas. */
const MANILHAS: Record<string, string> = {
  "4♣": "Zap",
  "7♥": "Sete Copas",
  "A♠": "Espadilha",
  "7♦": "Pica-fumo",
};

export interface PlayerCardIdentity {
  initials: string;
  rank: string;
  suit: string;
  suitName: string;
  isRed: boolean;
  /** Apelido da manilha, quando a carta do jogador é uma delas. */
  manilha: string | null;
  /** Matiz próprio do jogador (mesma paleta das duplas). */
  hue: number;
}

/** FNV-1a: espalha bem ids parecidos e é estável entre visitas. */
function hashId(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Carta de cada jogador derivada só do id e do nome que a lista pública já expõe:
 * o mesmo jogador sempre recebe o mesmo valor, naipe e cor, sem coluna nova no banco.
 */
export function playerCardIdentity(player: { id: string; name: string }): PlayerCardIdentity {
  const hash = hashId(player.id);
  const suit = SUITS[hash % SUITS.length];
  const rank = RANKS[Math.floor(hash / SUITS.length) % RANKS.length];
  return {
    initials: initials(player.name) || "?",
    rank,
    suit: suit.symbol,
    suitName: suit.name,
    isRed: suit.red,
    manilha: MANILHAS[`${rank}${suit.symbol}`] ?? null,
    hue: teamHue(player.id) ?? 255,
  };
}
