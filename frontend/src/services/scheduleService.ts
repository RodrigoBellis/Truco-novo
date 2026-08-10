import type { MatchQueue, MyQueueStatus } from "@truco/shared";
import { apiRequest } from "./api";

export function generateSchedule(): Promise<{ assignmentsCount: number }> {
  return apiRequest("/schedule/generate", { method: "POST" });
}

/** Fila única e sequencial dos próximos jogos ("Ordem dos Jogos"). Mesa é só um detalhe
 *  interno do escalonador — não é exposta aqui. */
export function getMatchQueue(): Promise<MatchQueue> {
  return apiRequest("/schedule/queue");
}

export function getMyQueueStatus(): Promise<MyQueueStatus> {
  return apiRequest("/schedule/my-status");
}

export function updateMatchSchedule(
  matchId: string,
  patch: { tableNumber?: number | null; queuePosition?: number | null },
): Promise<void> {
  return apiRequest(`/schedule/matches/${matchId}`, { method: "PATCH", body: patch });
}
