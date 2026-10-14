import type { KnockoutMatchView } from "./bracket.js";
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
  /** 1º e 2º: direto na semifinal. */
  qualifiedDirect: string[];
  /** 3º a 6º: quartas de final. */
  qualifiedQuarter: string[];
  /** 7º: eliminado. */
  eliminated: string | null;
  /** Houve empate exato e o simulador fez o papel do administrador para decidir as posições. */
  tieResolvedManually: boolean;
}

export interface SimulationFinalSummary {
  championTeamName: string | null;
  runnerUpTeamName: string | null;
  finalScore: string | null;
  thirdPlaceTeamName: string | null;
  thirdPlaceScore: string | null;
}

export interface SimulationReport {
  seed: number;
  executedAt: string;
  totalPlayers: number;
  totalTeams: number;
  approvedTeams: number;
  groups: SimulationGroupSummary[];
  /** Chaveamento completo, na ordem do plano oficial (quartas → final). */
  knockout: KnockoutMatchView[];
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
