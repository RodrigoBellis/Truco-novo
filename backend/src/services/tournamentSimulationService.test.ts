import test from "node:test";
import assert from "node:assert/strict";
import { pointsForResult } from "@truco/shared";
import { store } from "../data/simulationStore.js";
import { SEED_HISTORY } from "../data/seed.js";
import { createSeededRandom } from "../utils/seededRandom.js";
import { currentEnvironment, isSimulationEnabled } from "../utils/environment.js";
import { runFullSimulation, resetSimulation } from "./tournamentSimulationService.js";
import { computeStandings } from "./simulation/standingsService.js";

test("pontuação segue a regra 3/2/1/0", () => {
  assert.equal(pointsForResult({ setsA: 2, setsB: 0 }, true), 3);
  assert.equal(pointsForResult({ setsA: 2, setsB: 0 }, false), 0);
  assert.equal(pointsForResult({ setsA: 2, setsB: 1 }, true), 2);
  assert.equal(pointsForResult({ setsA: 2, setsB: 1 }, false), 1);
  assert.equal(pointsForResult({ setsA: 1, setsB: 2 }, true), 1);
  assert.equal(pointsForResult({ setsA: 1, setsB: 2 }, false), 2);
  assert.equal(pointsForResult({ setsA: 0, setsB: 2 }, true), 0);
  assert.equal(pointsForResult({ setsA: 0, setsB: 2 }, false), 3);
});

test("o gerador com seed é determinístico e varia entre seeds", () => {
  const a = createSeededRandom(42);
  const b = createSeededRandom(42);
  const c = createSeededRandom(43);

  const seqA = Array.from({ length: 8 }, () => a());
  const seqB = Array.from({ length: 8 }, () => b());
  const seqC = Array.from({ length: 8 }, () => c());

  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  seqA.forEach((value) => {
    assert.ok(value >= 0 && value < 1);
  });
});

test("a simulação completa é aprovada sem erros", () => {
  const report = runFullSimulation();

  assert.equal(report.status, "SIMULAÇÃO APROVADA");
  assert.deepEqual(report.errors, []);
  assert.equal(report.approvedTeams, 12);
  assert.equal(report.groupMatches, 30);
  assert.equal(report.knockoutMatches, 9);
  assert.equal(report.totalMatches, 39);
  assert.match(report.warnings[0] ?? "", /12 duplas, seis por grupo/);
  assert.ok(report.final.championTeamName);
  assert.ok(report.final.runnerUpTeamName);
  assert.notEqual(report.final.championTeamName, report.final.runnerUpTeamName);
});

test("a mesma seed reproduz exatamente o mesmo campeonato", () => {
  const first = runFullSimulation({ seed: 20260 });
  const second = runFullSimulation({ seed: 20260 });

  assert.deepEqual(first.groups, second.groups);
  assert.deepEqual(first.final, second.final);
});

test("seeds diferentes continuam produzindo campeonatos válidos", () => {
  [1, 7, 99, 12345].forEach((seed) => {
    const report = runFullSimulation({ seed });
    assert.equal(report.status, "SIMULAÇÃO APROVADA", `seed ${seed} deveria ser aprovada`);
    assert.equal(report.groups[0].teamNames.length, 6);
    assert.equal(report.groups[1].teamNames.length, 6);
  });
});

test("cabeças de chave nunca caem no mesmo grupo", () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    runFullSimulation({ seed });
    const seededTeams = store.approvedTeams().filter((team) => team.seeded);
    assert.equal(seededTeams.length, 2);
    assert.notEqual(seededTeams[0].groupId, seededTeams[1].groupId, `seed ${seed} juntou as cabeças de chave`);
  }
});

test("classificação numera de 1º a 6º em cada grupo", () => {
  runFullSimulation({ seed: 2026 });

  (["A", "B"] as const).forEach((groupId) => {
    const rows = computeStandings(groupId);
    assert.deepEqual(
      rows.map((row) => row.position),
      [1, 2, 3, 4, 5, 6],
    );
    rows.forEach((row) => {
      assert.equal(row.jogos, 5);
      assert.equal(row.vitorias + row.derrotas, 5);
    });
  });
});

test("o modo de simulação fica desabilitado em produção", () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.equal(isSimulationEnabled(), false);
    assert.equal(currentEnvironment(), "production");

    process.env.NODE_ENV = "development";
    assert.equal(isSimulationEnabled(), true);

    delete process.env.NODE_ENV;
    assert.equal(isSimulationEnabled(), true, "sem NODE_ENV assume desenvolvimento local");
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});

test("reiniciar a simulação volta ao estado inicial preservando dados-base", () => {
  runFullSimulation();
  resetSimulation();

  assert.equal(store.drawStatus, "pendente");
  assert.equal(store.currentPhase, "Aguardando sorteio");
  assert.equal(store.matches.length, 0);
  assert.equal(store.bracketMatches.length, 0);
  assert.equal(store.getGroup("A").teamIds.length, 0);
  assert.equal(store.getGroup("B").teamIds.length, 0);
  // Derivado do seed: o histórico é dado-base preservado, não um número fixo —
  // assim o teste não quebra a cada nova edição adicionada ao Hall da Fama.
  assert.equal(store.history.length, SEED_HISTORY.length);
  assert.ok(store.players.length > 0);
  assert.ok(store.teams.length > 0);
  assert.equal(store.teams.every((team) => team.groupId === null), true);
});
