// lib/privacy/account-data.test.ts — export shape and the delete confirmation.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildExport, isDeleteConfirmed } from "./account-data.ts";

describe("account export", () => {
  it("always carries every table, empty when the person has no rows", () => {
    const e = buildExport(new Date("2026-11-20T10:00:00Z"), { email: "a@b.c", plan: "free", createdAt: null }, { watchlists: [{ kind: "seed", ref: "meal prep" }] });
    assert.deepEqual(Object.keys(e.data).sort(), ["metric_events", "research_runs", "usage_events", "watchlists"]);
    assert.equal(e.data.watchlists.length, 1);
    assert.deepEqual(e.data.usage_events, []);
    assert.equal(e.exportedAt, "2026-11-20T10:00:00.000Z");
  });
});

describe("delete confirmation", () => {
  it("accepts the phrase with any case and spacing", () => {
    assert.equal(isDeleteConfirmed({ confirm: "  Delete   My Account " }), true);
  });
  it("refuses anything else", () => {
    for (const body of [null, {}, { confirm: "yes" }, { confirm: 1 }, { confirm: "delete my account now" }]) assert.equal(isDeleteConfirmed(body), false);
  });
});
