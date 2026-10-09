import test from "node:test";
import assert from "node:assert/strict";
import type { Player } from "@truco/shared";
import { isCurrentEditionParticipant, loginRoster } from "./loginRoster.js";

const players: Player[] = [
  { id: "bitula", name: "Bitula", role: "jogador", teamId: "t-bitula-galao", avatarUrl: null },
  { id: "galao", name: "Galão", role: "jogador", teamId: "t-bitula-galao", avatarUrl: null },
  // Campeão da 3ª edição sem dupla na edição atual: existe só para o histórico.
  { id: "vinicius", name: "Vinícius", role: "jogador", teamId: null, avatarUrl: null },
  { id: "admin", name: "Administrador", role: "superadmin", teamId: null, avatarUrl: null },
];

test("login lista só os participantes oficiais da edição atual", () => {
  assert.deepEqual(loginRoster(players), [{ id: "bitula", name: "Bitula" }, { id: "galao", name: "Galão" }]);
});

test("jogador exclusivamente histórico não aparece no login nem é participante", () => {
  assert.equal(loginRoster(players).some((player) => player.name === "Vinícius"), false);
  assert.equal(isCurrentEditionParticipant(players[2]), false);
});

test("o mesmo cadastro passa a aparecer quando entra numa dupla da edição atual", () => {
  const registered = players.map((player) => (player.id === "vinicius" ? { ...player, teamId: "t-nova" } : player));
  assert.deepEqual(loginRoster(registered).map((player) => player.id), ["bitula", "galao", "vinicius"]);
});

test("a lista pública entrega apenas id e nome", () => {
  assert.deepEqual(Object.keys(loginRoster(players)[0]), ["id", "name"]);
});
