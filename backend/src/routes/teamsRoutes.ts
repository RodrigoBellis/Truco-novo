import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { EDITION_TEAM_COUNT, TEAMS_PER_GROUP, isValidTeamStrength, type GroupId } from "@truco/shared";
import { validateTeamParticipation, validateTeamStatusChange } from "../services/teamParticipationService.js";

export const teamsRoutes = Router();

const CAPACITY_MESSAGE = `A edição aceita ${EDITION_TEAM_COUNT} duplas aprovadas, com ${TEAMS_PER_GROUP} em cada grupo.`;
/** Limite da edição ou jogador já em outra dupla é conflito (409); o resto é dado inválido (400). */
const conflictStatus = (message: string) => (/já tem \d+ duplas|comporta \d+ duplas|outra dupla/.test(message) ? 409 : 400);

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
      res.status(conflictStatus(validationError)).json({ message: validationError });
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
    if (!group || active.length >= EDITION_TEAM_COUNT || active.filter((row) => row.groupId === group).length >= TEAMS_PER_GROUP) {
      res.status(409).json({ message: CAPACITY_MESSAGE });
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
      res.status(conflictStatus(validationError)).json({ message: validationError });
      return;
    }
    if (currentTeam?.status !== "aprovada") {
      const active = teams.filter((row) => row.status === "aprovada");
      if (active.length >= EDITION_TEAM_COUNT || active.filter((row) => row.groupId === input.groupId).length >= TEAMS_PER_GROUP) {
        res.status(409).json({ message: CAPACITY_MESSAGE });
        return;
      }
    }
    const groupMatches = await store.listMatches(championship.truco_id, { stage: "grupos" });
    if (groupMatches.some((match) => (match.teamAId === teamId || match.teamBId === teamId) && match.status === "realizado")) {
      res.status(409).json({ message: "Não é possível alterar integrantes ou grupo depois de registrar resultados." });
      return;
    }
    // Os jogos guardam o grupo em que foram gerados: trocar a dupla de grupo depois disso
    // deixaria partida dizendo um grupo e dupla dizendo outro.
    if (input.groupId !== currentTeam.groupId && groupMatches.some((match) => match.teamAId === teamId || match.teamBId === teamId)) {
      res.status(409).json({ message: "Não é possível mudar o grupo de uma dupla que já tem jogos gerados na fase de grupos." });
      return;
    }
    res.json(await store.updateTeamParticipation(teamId, { championshipId: championship.truco_id, ...input }));
  }),
);
