export function currentEnvironment(): string {
  return process.env.NODE_ENV ?? "development";
}

/** O modo de simulação só existe fora de produção. */
export function isSimulationEnabled(): boolean {
  return currentEnvironment() !== "production";
}
