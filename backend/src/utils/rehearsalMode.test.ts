import test from "node:test";
import assert from "node:assert/strict";
import { isRehearsalMode } from "./rehearsalMode.js";

test("modo de ensaio exige opt-in e é recusado em produção", () => {
  const flag = process.env.TRUCO_REHEARSAL;
  const environment = process.env.NODE_ENV;
  try {
    delete process.env.TRUCO_REHEARSAL;
    process.env.NODE_ENV = "production";
    assert.equal(isRehearsalMode(), false);
    process.env.TRUCO_REHEARSAL = "1";
    assert.throws(isRehearsalMode, /não é permitido/);
    process.env.NODE_ENV = "test";
    assert.equal(isRehearsalMode(), true);
  } finally {
    if (flag === undefined) delete process.env.TRUCO_REHEARSAL; else process.env.TRUCO_REHEARSAL = flag;
    if (environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = environment;
  }
});
