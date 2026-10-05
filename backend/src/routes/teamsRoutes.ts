import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { isValidTeamStrength, type GroupId } from "@truco/shared";
import { validateTeamParticipation, validateTeamStatusChange } from "../services/teamParticipationService.js";

export const teamsRoutes = Router();

function parseParticipation(body: unknown): { name: string; player1Id: string; player2Id: string; groupId: GroupId; strength: number } | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  if (typeof value.name !== "string" || !value.name.trim()) return null;
  if (typeof value.player1Id !== "string" || typeof value.player2Id !== "string" || value.player1Id === value.player2Id) return null;
  if (value.groupId !== "A" && value.groupId !== "B") return null;
  if (typeof value.strength !== "number" || !isValidTeamStrength(value.strength)) return null;
  return { name: value.name, player1Id: value.player1Id, player2Id: value.player2Id, groupId: value.groupId, strength: value.strength };
}

teamsRoutes.post(
  "/",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (req, res) => {
    const input = parseParticipation(req.body);
    if (!input) {
      res.status(400).json({ message: "Confira nome, jogadores diferentes, grupo e força de 1 a 5 estrelas." });
      return;
    }
    const championship = await store.getCurrentChampionship();
    const teams = await store.listTeams(championship.truco_id);
    const players = await store.listPlayers();
    const validationError = validateTeamParticipation(input, teams, players);
    if (validationError) {
      res.status(validationError.includes("já tem 5") || validationError.includes("10 duplas") || validationError.includes("outra dupla") ? 409 : 400).json({ message: validationError });
      return;
    }
    res.status(201).json(await store.createTeamParticipation({ championshipId: championship.truco_id, ...input }));
  }),
);

teamsRoutes.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const championship = await store.getCurrentChampionship();
    res.json(await store.listTeams(championship.truco_id));
  }),
);

teamsRoutes.post(
  "/:id/approve",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (req, res) => {
    const teamId = String(req.params.id);
    const team = await store.getTeam(teamId);
    if (!team) {
      res.status(404).json({ message: "Dupla não encontrada." });
      return;
    }
    const championship = await store.getCurrentChampionship();
    const teams = await store.listTeams(championship.truco_id);
    const active = teams.filter((row) => row.status === "aprovada");
    const group = teams.find((row) => row.id === teamId)?.groupId;
    if (team.status === "aprovada") {
      res.json(team);
      return;
    }
    if (!group || active.length >= 10 || active.filter((row) => row.groupId === group).length >= 5) {
      res.status(409).json({ message: "A edição aceita 10 duplas aprovadas, com 5 em cada grupo." });
      return;
    }
    res.json(await store.approveTeam(teamId));
  }),
);

teamsRoutes.post(
  "/:id/reject",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (req, res) => {
    const teamId = String(req.params.id);
    const team = await store.getTeam(teamId);
    if (!team) {
      res.status(404).json({ message: "Dupla não encontrada." });
      return;
    }
    await store.rejectTeam(teamId);
    res.status(204).send();
  }),
);

teamsRoutes.patch(
  "/:id/status",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (req, res) => {
    const teamId = String(req.params.id);
    const status = req.body?.status;
    if (status !== "aprovada" && status !== "pendente") {
      res.status(400).json({ message: "Status de participação inválido." });
      return;
    }
    const championship = await store.getCurrentChampionship();
    const teams = await store.listTeams(championship.truco_id);
    const team = teams.find((row) => row.id === teamId);
    if (!team) {
      res.status(404).json({ message: "Participação não encontrada." });
      return;
    }
    if (status === "pendente") {
      const matches = await store.listMatches(championship.truco_id, { stage: "grupos" });
      if (matches.some((match) => (match.teamAId === teamId || match.teamBId === teamId) && match.status === "realizado")) {
        res.status(409).json({ message: "Não é possível retirar uma dupla depois de registrar resultados nesta edição." });
        return;
      }
    }
    const statusError = validateTeamStatusChange(teams, teamId, status);
    if (statusError) {
      res.status(409).json({ message: statusError });
      return;
    }
    await store.setTeamStatus(teamId, status);
    res.json({ ...team, status });
  }),
);

teamsRoutes.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "superadmin"),
  asyncHandler(async (req, res) => {
    const teamId = String(req.params.id);
    const team = await store.getTeam(teamId);
    if (!team) {
      res.status(404).json({ message: "Dupla não encontrada." });
      return;
    }
    const input = parseParticipation(req.body);
    if (!input) {
      res.status(400).json({ message: "Confira nome, jogadores diferentes, grupo e força de 1 a 5 estrelas." });
      return;
    }
    const championship = await store.getCurrentChampionship();
    const teams = await store.listTeams(championship.truco_id);
    const players = await store.listPlayers();
    const currentTeam = teams.find((row) => row.id === teamId);
    if (!currentTeam) {
      res.status(404).json({ message: "Participação não encontrada nesta edição." });
      return;
    }
    const validationError = validateTeamParticipation(input, teams, players, teamId);
    if (validationError) {
      res.status(validationError.includes("já tem 5") || validationError.includes("10 duplas") || validationError.includes("outra dupla") ? 409 : 400).json({ message: validationError });
      return;
    }
    if (currentTeam?.status !== "aprovada") {
      const active = teams.filter((row) => row.status === "aprovada");
      if (active.length >= 10 || active.filter((row) => row.groupId === input.groupId).length >= 5) {
        res.status(409).json({ message: "A edição aceita 10 duplas aprovadas, com 5 em cada grupo." });
        return;
      }
    }
    const groupMatches = await store.listMatches(championship.truco_id, { stage: "grupos" });
    if (groupMatches.some((match) => (match.teamAId === teamId || match.teamBId === teamId) && match.status === "realizado")) {
      res.status(409).json({ message: "Não é possível alterar integrantes ou grupo depois de registrar resultados." });
      return;
    }
    res.json(await store.updateTeamParticipation(teamId, { championshipId: championship.truco_id, ...input }));
  }),
);
