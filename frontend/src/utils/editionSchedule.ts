import type { DashboardChampion } from "@truco/shared";

/**
 * Início oficial da 5ª Edição: 25/10/2026 às 12h no horário de America/Sao_Paulo (UTC-03:00,
 * sem horário de verão). Por decisão do dono do projeto a data fica nesta constante, no código,
 * sem coluna nem migração no banco. É a ÚNICA fonte da data: a Home lê tudo daqui.
 */
export const EDITION_START = "2026-10-25T12:00:00-03:00";
export const EDITION_START_MS = Date.parse(EDITION_START);
export const EDITION_TIME_ZONE = "America/Sao_Paulo";

export type EditionStatus = "aguardando-inicio" | "aguardando-liberacao" | "em-andamento" | "encerrado";

export interface EditionStatusInput {
  /** Instante atual em milissegundos (Date.now()). */
  now: number;
  /** Cadeado de resultados do Admin. Desconhecido conta como fechado, o lado seguro. */
  locked: boolean;
  /** Campeão oficial da edição; `null`/`undefined` quando não há ou quando não foi possível consultar. */
  champion: DashboardChampion | null | undefined;
}

/**
 * Situação da edição, regra do dono do projeto. Não olha placares nem jogos lançados (há placares
 * de teste): só o campeão oficial, o horário de início e o cadeado do administrador.
 */
export function editionStatus({ now, locked, champion }: EditionStatusInput): EditionStatus {
  if (champion != null) return "encerrado";
  if (now < EDITION_START_MS) return "aguardando-inicio";
  if (locked) return "aguardando-liberacao";
  return "em-andamento";
}

export const EDITION_STATUS_LABEL: Record<EditionStatus, string> = {
  "aguardando-inicio": "Aguardando início",
  "aguardando-liberacao": "Aguardando liberação do administrador",
  "em-andamento": "Em andamento",
  encerrado: "Encerrado",
};

/** Frase curta de mesa de truco para cada situação. Não afirma nenhum dado do campeonato. */
export const EDITION_STATUS_PHRASE: Record<EditionStatus, string> = {
  "aguardando-inicio": "Combine os sinais com seu parceiro: a mesa abre em breve.",
  "aguardando-liberacao": "Cartas na mesa. Falta só o administrador liberar os resultados.",
  "em-andamento": "Valendo! Cada queda conta, peça truco sem medo.",
  encerrado: "O caneco já tem dono. Até a próxima edição.",
};

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Tempo que falta até o início; `null` quando o horário já chegou (nunca devolve número negativo). */
export function countdownParts(now: number): CountdownParts | null {
  const remaining = EDITION_START_MS - now;
  if (remaining <= 0) return null;
  const totalSeconds = Math.floor(remaining / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/** "25/10/2026 · 12h", sempre no fuso de São Paulo, qualquer que seja o fuso do aparelho. */
export function formatEditionStart(): string {
  const start = new Date(EDITION_START_MS);
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: EDITION_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(start);
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: EDITION_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(start);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${date} · ${hour}h${minute === "00" ? "" : minute}`;
}
