import type { HallOfFame, HistoryEntry } from "@truco/shared";
import { supabase } from "../lib/supabaseClient";

interface TeamMemberRow {
  position: number;
  truco_players: { name: string } | null;
}

interface HistoryTeamRow {
  name: string;
  truco_team_members: TeamMemberRow[];
}

interface HistoryRow {
  truco_id: string;
  edition: number;
  name: string;
  year: number;
  final_result: string | null;
  notes: string;
  champion: HistoryTeamRow | null;
  runner_up: HistoryTeamRow | null;
}

function playerNames(team: HistoryTeamRow | null): [string, string] | null {
  if (!team) return null;
  const sorted = [...team.truco_team_members].sort((a, b) => a.position - b.position);
  const names = sorted.map((member) => member.truco_players?.name ?? "—");
  if (names.length < 2) return null;
  return [names[0], names[1]];
}

/** Busca o Hall da Fama direto do Supabase (leitura pública via RLS) — histórico das edições encerradas. */
export async function getHallOfFame(): Promise<HallOfFame> {
  const { data, error } = await supabase
    .from("truco_history")
    .select(
      `truco_id, edition, name, year, final_result, notes,
       champion:truco_teams!truco_history_champion_team_id_fkey(name, truco_team_members(position, truco_players(name))),
       runner_up:truco_teams!truco_history_runner_up_team_id_fkey(name, truco_team_members(position, truco_players(name)))`,
    )
    .order("edition", { ascending: true })
    .returns<HistoryRow[]>();

  if (error) throw new Error(error.message);

  const editions: HistoryEntry[] = (data ?? []).map((row) => ({
    id: row.truco_id,
    edition: row.edition,
    name: row.name,
    year: row.year,
    champions: playerNames(row.champion) ?? ["—", "—"],
    runnersUp: playerNames(row.runner_up),
    finalResult: row.final_result,
    notes: row.notes,
  }));

  const { data: current } = await supabase
    .from("truco_championships")
    .select("edition, year")
    .eq("status", "em_andamento")
    .maybeSingle();

  const lastEdition = editions.at(-1)?.edition ?? 0;

  return {
    editions,
    currentEdition: current?.edition ?? lastEdition + 1,
    currentYear: current?.year ?? new Date().getFullYear(),
  };
}
