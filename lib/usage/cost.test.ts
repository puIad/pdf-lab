// lib/usage/cost.test.ts: Part 5.3 acceptance. Cost per run is summarised from ledger rows and held
// against documented bounds; every plan's worst case stays inside its budget.

import assert from "node:assert/strict";
import test from "node:test";
import { COST_CEILING_USD, deepRunCostLine, summarizeRuns, type RunCost } from "./cost.ts";
import { LIMITS, PLAN_BUDGET_USD, worstCaseMonthlyUsd, type Plan } from "../quotas/quotas.ts";
import { makeMeter, priceCall, type LedgerRow } from "./ledger.ts";

const run = (id: string, costUsd: number, mode = "deep", unpricedCalls = 0): RunCost => ({ runId: id, mode, calls: 3, totalTokens: 1000, costUsd, unpricedCalls });
const usage = (p: number, c: number) => ({ promptTokens: p, completionTokens: c, totalTokens: p + c, estimatedCostUsd: 0 });

test("a run priced from the rate table lands inside the Deep ceiling", async () => {
  const rows: LedgerRow[] = [];
  const meter = makeMeter({ insert: async (r) => void rows.push(r) }, "u1", { runId: "r1" });
  // A Deep run: 25 batched extraction calls and one embedding call on the table's models.
  for (let i = 0; i < 25; i++) await meter({ provider: "p", model: "gpt-4o-mini", tier: "cheap", keySource: "hosted", latencyMs: 1, usage: usage(6000, 1200) });
  await meter({ provider: "p", model: "text-embedding-3-small", tier: "embed", keySource: "hosted", latencyMs: 1, usage: usage(40000, 0) });
  const cost = rows.reduce((a, r) => a + r.estimatedCostUsd, 0);
  assert.ok(rows.every((r) => r.costBasis === "table"));
  assert.ok(cost > 0 && cost <= COST_CEILING_USD.deep, `cost ${cost}`);
  assert.equal(priceCall({ model: "unknown-model", usage: usage(1, 1) }).basis, "unpriced");
});

test("summary counts only runs of the asked mode, never explore or validate runs", () => {
  const s = summarizeRuns([run("a", 0.05), run("e", 0.9, "explore"), run("v", 0.8, "validate")]);
  assert.equal(s.runs, 1);
  assert.equal(s.maxUsd, 0.05);
  assert.deepEqual(s.overCeiling, []);
});

test("summary: median, max, and runs over the ceiling", () => {
  const s = summarizeRuns([run("a", 0.05), run("b", 0.07), run("c", 0.09), run("d", 0.3), run("x", 9, "explore")]);
  assert.equal(s.runs, 4);
  assert.equal(s.medianUsd, 0.07);
  assert.equal(s.maxUsd, 0.3);
  assert.deepEqual(s.overCeiling.map((r) => r.runId), ["d"]);
});

test("nothing observed gives nulls and a ceiling line, never an invented average", () => {
  const s = summarizeRuns([]);
  assert.equal(s.medianUsd, null);
  assert.match(deepRunCostLine(s), /at most \$0\.25.*0 measured runs/);
  assert.match(deepRunCostLine(summarizeRuns(["1", "2", "3", "4", "5"].map((i) => run(i, 0.04)))), /about \$0\.04 at current usage \(median of 5 runs\)/);
});

test("every plan's worst-case month stays inside its budget", () => {
  for (const plan of ["anon", "free", "premium"] as Plan[]) {
    assert.ok(worstCaseMonthlyUsd(plan) <= PLAN_BUDGET_USD[plan], `${plan}: ${worstCaseMonthlyUsd(plan)} > ${PLAN_BUDGET_USD[plan]}`);
  }
  assert.ok(LIMITS.premium.deep.max > LIMITS.free.deep.max);
});
