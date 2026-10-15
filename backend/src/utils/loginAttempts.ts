/**
 * Limite de tentativas de entrada (memória do processo; uma instância em produção). Conta só as
 * recusas: quem acerta a senha não gasta tentativa, e um acerto zera o contador da conta.
 */
const WINDOW_MS = 10 * 60_000;
const failures = new Map<string, number[]>();

function recent(key: string): number[] {
  const now = Date.now();
  const list = (failures.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (list.length > 0) failures.set(key, list); else failures.delete(key);
  return list;
}

/** Algum dos pares chave/limite já esgotou as recusas da janela. */
export function loginBlocked(limits: Array<[key: string, max: number]>): boolean {
  return limits.some(([key, max]) => recent(key).length >= max);
}

export function recordLoginFailure(keys: string[]): void {
  const now = Date.now();
  for (const key of keys) failures.set(key, [...recent(key), now]);
}

export function clearLoginFailures(key: string): void {
  failures.delete(key);
}

export function resetLoginAttempts(): void {
  failures.clear();
}
