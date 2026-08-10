import type { SimulationAvailability, SimulationReport } from "@truco/shared";
import { apiRequest } from "./api";

export function getSimulationAvailability(): Promise<SimulationAvailability> {
  return apiRequest<SimulationAvailability>("/simulation/status");
}

export function runSimulation(seed?: number): Promise<SimulationReport> {
  return apiRequest<SimulationReport>("/simulation/run", { method: "POST", body: seed === undefined ? {} : { seed } });
}

export function resetSimulation(): Promise<void> {
  return apiRequest<void>("/simulation/reset", { method: "POST" });
}
