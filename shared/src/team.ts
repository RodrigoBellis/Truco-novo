export type GroupId = "A" | "B";

export type TeamStatus = "pendente" | "aprovada";

export interface Team {
  id: string;
  name: string;
  player1Id: string;
  player2Id: string;
  status: TeamStatus;
  seeded: boolean;
  isPlaceholder: boolean;
  groupId: GroupId | null;
}
