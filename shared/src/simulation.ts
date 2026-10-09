import type { KnockoutMatchView, QuarterfinalPairing } from "./bracket.js";
import type { StandingRow } from "./group.js";
import type { GroupId, QualificationZone } from "./team.js";

export type SimulationStatus = "SIMULAÇÃO APROVADA" | "SIMULAÇÃO REPROVADA";

export type ValidationSeverity = "erro" | "aviso";

export interface SimulationCheck {
  id: string;
  label: string;
  passed: boolean;
  severity: ValidationSeverity;
  detail: string;
}

export interface SimulationStandingRow extends StandingRow {
  teamName: string;
  zone: QualificationZone;
}

export interface SimulationGroupSummary {
  id: GroupId;
  name: string;
  teamNames: string[];
  /** Tabela final do grupo, já com a zona de cada posição. */
  standings: SimulationStandingRow[];
  /** 1º: direto na semifinal. */
  qualifiedDirect: string | null;
  /** 2º: direto nas quartas de final. */
  qualifiedQuarter: string | null;
  /** 3º e 4º: repescagem. */
  qualifiedPlayoff: string[];
  /** 5º: eliminado. */
  eliminated: string | null;
  /** Houve empate exato e o simulador fez o papel do administrador para decidir as posições. */
  tieResolvedManually: boolean;
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
  /** Chaveamento completo, na ordem do plano oficial (repescagem → final). */
  knockout: KnockoutMatchView[];
  /** Como as quartas foram cruzadas para evitar reencontros da fase de grupos. */
  quarterfinals: QuarterfinalPairing | null;
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
