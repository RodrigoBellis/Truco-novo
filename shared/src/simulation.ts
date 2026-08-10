import type { GroupId } from "./team.js";

export type SimulationStatus = "SIMULAÇÃO APROVADA" | "SIMULAÇÃO REPROVADA";

export type ValidationSeverity = "erro" | "aviso";

export interface SimulationCheck {
  id: string;
  label: string;
  passed: boolean;
  severity: ValidationSeverity;
  detail: string;
}

export interface SimulationGroupSummary {
  id: GroupId;
  name: string;
  teamNames: string[];
  qualifiedDirect: string | null;
  qualifiedPlayoff: string[];
  eliminated: string | null;
}

export interface SimulationFinalSummary {
  championTeamName: string | null;
  runnerUpTeamName: string | null;
  finalScore: string | null;
}

export interface SimulationReport {
  seed: number;
  executedAt: string;
  totalPlayers: number;
  totalTeams: number;
  approvedTeams: number;
  groups: SimulationGroupSummary[];
  groupMatches: number;
  knockoutMatches: number;
  totalMatches: number;
  final: SimulationFinalSummary;
  checks: SimulationCheck[];
  errors: string[];
  warnings: string[];
  status: SimulationStatus;
}

export interface SimulationAvailability {
  enabled: boolean;
  environment: string;
  defaultSeed: number;
}
