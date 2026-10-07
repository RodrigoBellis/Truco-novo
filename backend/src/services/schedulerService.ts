import { store } from "../data/store.js";
import { buildSchedule, type TableAssignment } from "./scheduleBuilder.js";

export { buildSchedule, findConflicts, findQueueAdjacencyConflicts, type TableAssignment } from "./scheduleBuilder.js";

/** Gera a escala e grava table_number/block_number/queue_position no banco. */
export async function generateSchedule(championshipId: string): Promise<TableAssignment[]> {
  const matches = await store.listMatches(championshipId, { stage: "grupos" });
  const assignments = buildSchedule(matches);
  await store.applyScheduleAssignments(assignments);
  return assignments;
}
