/**
 * Uma restrição de unicidade do banco recusou a gravação (Postgres 23505): outra requisição
 * — ou outra instância do backend — já gravou a mesma coisa. Quem chama relê o estado e segue.
 */
export class StoreConflictError extends Error {}

export class StoreOperationError extends Error {
  /** `detail` é a mensagem original do banco: vai só para o registro do servidor, nunca para a resposta. */
  constructor(message: string, public readonly code: string = "unknown", public readonly detail?: string) { super(message); }
  get retryable(): boolean {
    return ["40001", "40P01", "53300", "57P01", "57014", "PGRST000", "PGRST001", "PGRST002", "PGRST003"].includes(this.code)
      || this.code.startsWith("08");
  }
}
