import type { StandingRow } from "@truco/shared";

/** Situação do confronto, derivada só da classificação real do grupo. */
export type InsightTone = "abertura" | "lider" | "acima" | "colado" | "logo-atras" | "atras";

export interface OpponentInsight {
  tone: InsightTone;
  /** Frase motivacional sorteada de forma estável para o mesmo jogo. */
  message: string;
  /** Ex.: "1º lugar do Grupo A" — null na rodada de abertura. */
  positionLabel: string | null;
  /** Medalha/ícone da posição do adversário. */
  medal: string | null;
}

/** Várias frases por cenário para o app não ficar repetitivo. */
const PHRASES: Record<InsightTone, string[]> = {
  abertura: [
    "Começa agora a caminhada no grupo. Que venha a primeira vitória! 🎴",
    "Primeira rodada, tabela zerada. Tudo a conquistar. 🚀",
    "Todo mundo empatado na largada. Hora de sair na frente. ⚡",
    "O campeonato começa aqui. Bom jogo e boa sorte! 🍀",
  ],
  lider: [
    "Seu próximo adversário é o líder do grupo. Uma vitória aqui pode mudar completamente sua posição. 🔥",
    "Pega o líder! Vitória essencial para encostar na ponta. 🔥",
    "Dupla mais forte do grupo pela frente. É jogo de decisão. 👑",
  ],
  acima: [
    "Eles estão na sua frente na tabela. Essa é a chance de diminuir a distância. 🎯",
    "Adversário à frente na classificação. Ganhou, encostou. 🎯",
    "Dá para ultrapassar hoje. Depende só de vocês. 📈",
  ],
  colado: [
    "Confronto direto! Esse jogo pode mudar a classificação do grupo. ⚔️",
    "Duplas coladas na tabela — quem vencer sai na frente. ⚔️",
    "Jogo de seis pontos: vale a sua vitória e o tropeço deles. 🔀",
  ],
  "logo-atras": [
    "Eles estão chegando perto. Vitória importante para manter a distância. 🛡️",
    "Adversário logo atrás, pressionando. Segura a posição! 🛡️",
    "Não deixe encostar. Vitória aqui mantém a vantagem. 🧱",
  ],
  atras: [
    "Você está à frente. Mantenha o ritmo e não dê espaço para reação. 💪",
    "Favoritismo é seu, mas no truco nada está ganho. Foco! 💪",
    "Vantagem na tabela — confirme dentro da mesa. 🎯",
  ],
};

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/** Escolhe uma frase de forma estável: o mesmo jogo mostra sempre a mesma. */
function pickStable(options: string[], seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return options[Math.abs(hash) % options.length];
}

function toneFor(mine: StandingRow, theirs: StandingRow): InsightTone {
  if (theirs.position === 1 && mine.position !== 1) return "lider";

  const pointsGap = Math.abs(mine.pontos - theirs.pontos);
  const positionsAdjacent = Math.abs(mine.position - theirs.position) === 1;
  if (pointsGap <= 1 && positionsAdjacent) return "colado";

  if (theirs.position < mine.position) return "acima";
  if (theirs.position === mine.position + 1) return "logo-atras";
  return "atras";
}

/**
 * Monta a leitura do próximo confronto a partir da classificação real do grupo.
 * Enquanto nenhuma das duplas tiver jogado, devolve a mensagem de abertura.
 */
export function buildOpponentInsight(params: {
  matchId: string;
  groupId: string;
  myTeamId: string;
  opponentTeamId: string;
  standings: StandingRow[];
}): OpponentInsight {
  const { matchId, groupId, myTeamId, opponentTeamId, standings } = params;

  const mine = standings.find((row) => row.teamId === myTeamId);
  const theirs = standings.find((row) => row.teamId === opponentTeamId);

  // Sem classificação relevante ainda (rodada de abertura) ou dupla fora da tabela.
  if (!mine || !theirs || (mine.jogos === 0 && theirs.jogos === 0)) {
    return {
      tone: "abertura",
      message: pickStable(PHRASES.abertura, matchId),
      positionLabel: null,
      medal: null,
    };
  }

  const tone = toneFor(mine, theirs);
  return {
    tone,
    message: pickStable(PHRASES[tone], matchId),
    positionLabel: `${theirs.position}º lugar do Grupo ${groupId}`,
    medal: MEDALS[theirs.position] ?? "▪",
  };
}
