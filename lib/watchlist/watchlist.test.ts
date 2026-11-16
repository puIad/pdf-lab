// lib/watchlist/watchlist.test.ts — which watchlist requests are valid and how a row is keyed.

import assert from "node:assert/strict";
import test from "node:test";
import { parseWatch, watchKey } from "./watchlist.ts";

const MARKET = "0b5c1f2e-9a3d-4c7b-8e21-5f6a7b8c9d0e";

test("a market is its id, with no region and no seed", () => {
  assert.deepEqual(parseWatch({ kind: "market", ref: MARKET.toUpperCase(), region: "gb", seed: "x" }), {
    watch: { kind: "market", ref: MARKET, region: "", seed: null },
  });
  assert.ok("error" in parseWatch({ kind: "market", ref: "budgeting" }));
});

test("a seed is lowercased, trimmed, and keeps its region", () => {
  assert.deepEqual(parseWatch({ kind: "seed", ref: "  Meal   Prep ", region: "gb" }), {
    watch: { kind: "seed", ref: "meal prep", region: "gb", seed: null },
  });
  // No region means the default scan region.
  assert.deepEqual(parseWatch({ kind: "seed", ref: "budgeting" }), { watch: { kind: "seed", ref: "budgeting", region: "us", seed: null } });
});

test("an idea needs the seed it came from", () => {
  assert.deepEqual(parseWatch({ kind: "idea", ref: "How to Meal Prep for a week", region: "us", seed: "Meal Prep" }), {
    watch: { kind: "idea", ref: "how to meal prep for a week", region: "us", seed: "meal prep" },
  });
  assert.ok("error" in parseWatch({ kind: "idea", ref: "how to meal prep", region: "us" }));
});

test("anything else is refused", () => {
  const bad = [
    null,
    {},
    { kind: "user", ref: "x" },
    { kind: "seed", ref: "a" },
    { kind: "seed", ref: "x".repeat(81) },
    { kind: "seed", ref: "budgeting", region: "fr" },
    { kind: "seed", ref: 42 },
    { kind: "idea", ref: "x".repeat(161), seed: "budgeting" },
    { kind: "idea", ref: "budget planner", seed: "x".repeat(81) },
  ];
  for (const input of bad) assert.ok("error" in parseWatch(input as never), JSON.stringify(input));
});

test("the key matches what parseWatch stores", () => {
  assert.equal(watchKey("seed", " Meal Prep ", "gb"), "seed|gb|meal prep");
  assert.notEqual(watchKey("seed", "meal prep", "gb"), watchKey("seed", "meal prep", "us"));
  assert.notEqual(watchKey("seed", "meal prep", "us"), watchKey("idea", "meal prep", "us"));
  // A market has no region, whatever is passed.
  assert.equal(watchKey("market", MARKET, "us"), watchKey("market", MARKET));
});
