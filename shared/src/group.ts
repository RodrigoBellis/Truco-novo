import type { GroupId } from "./team.js";

export interface Group {
  id: GroupId;
  name: string;
  teamIds: string[];
}

export interface StandingRow {
  position: number;
  teamId: string;
  jogos: number;
  vitorias: number;
  derrotas: number;
  pontos: number;
  saldoSets: number;
}
