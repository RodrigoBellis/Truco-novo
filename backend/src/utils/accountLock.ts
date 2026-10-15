/**
 * Criar senha e redefinir acesso da mesma conta nunca se intercalam neste processo (produção usa
 * uma instância): sem a fila, um reset que marcasse a pendência antes de uma criação simultânea
 * poderia sobrescrever, depois, a senha que a criação acabou de confirmar ao jogador.
 */
const accountQueues = new Map<string, Promise<unknown>>();

export function withAccountLock<T>(playerId: string, task: () => Promise<T>): Promise<T> {
  const previous = accountQueues.get(playerId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tail = run.catch(() => undefined);
  accountQueues.set(playerId, tail);
  void tail.then(() => { if (accountQueues.get(playerId) === tail) accountQueues.delete(playerId); });
  return run;
}
