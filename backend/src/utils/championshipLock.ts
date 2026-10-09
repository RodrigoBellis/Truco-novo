const tails = new Map<string, Promise<void>>();

/**
 * Fila por campeonato: as operações que mudam resultado ou avanço do mata-mata rodam uma de
 * cada vez dentro deste processo, na ordem de chegada. Uma tarefa que falha não trava a fila.
 *
 * Protege só este processo. Com mais de uma instância do backend, quem impede duplicidade são
 * as restrições de unicidade do banco (migration 202610090001_knockout_uniqueness.sql).
 */
export function withChampionshipLock<T>(championshipId: string, task: () => Promise<T>): Promise<T> {
  const run = (tails.get(championshipId) ?? Promise.resolve()).then(task);
  const tail = run.then(() => undefined, () => undefined);
  tails.set(championshipId, tail);
  void tail.then(() => {
    if (tails.get(championshipId) === tail) tails.delete(championshipId);
  });
  return run;
}
