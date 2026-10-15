import assert from "node:assert/strict";
import { test } from "node:test";
import { withAccountLock } from "./accountLock.js";

test("criar senha e redefinir acesso da mesma conta não se intercalam", async () => {
  const steps: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const reset = withAccountLock("p1", async () => { steps.push("reset:flag"); await gate; steps.push("reset:senha"); });
  const create = withAccountLock("p1", async () => { steps.push("criar:senha"); });
  const other = withAccountLock("p2", async () => { steps.push("outra-conta"); });
  await other;
  release();
  await Promise.all([reset, create]);
  assert.deepEqual(steps, ["reset:flag", "outra-conta", "reset:senha", "criar:senha"]);
});

test("falha numa operação não trava a fila da conta", async () => {
  await assert.rejects(withAccountLock("p3", async () => { throw new Error("falhou"); }));
  assert.equal(await withAccountLock("p3", async () => "ok"), "ok");
});
