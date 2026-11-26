// lib/privacy/account-data.test.ts — export shape and the delete confirmation.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildExport, EXPORT_TABLES, isDeleteConfirmed, loadExportRows } from "./account-data.ts";
import { cappedSupabase } from "../db/capped-supabase.test-helpers.ts";

describe("account export", () => {
  it("always carries every table, empty when the person has no rows", () => {
    const e = buildExport(new Date("2026-11-20T10:00:00Z"), { email: "a@b.c", plan: "free", createdAt: null }, { watchlists: [{ kind: "seed", ref: "meal prep" }] });
    assert.deepEqual(Object.keys(e.data).sort(), ["ai_usage_ledger", "alert_settings", "alerts", "metric_events", "plan_changes", "research_runs", "usage_events", "user_google_tokens", "user_provider_keys", "watchlists"]);
    assert.equal(e.data.watchlists.length, 1);
    assert.deepEqual(e.data.usage_events, []);
    assert.equal(e.exportedAt, "2026-11-20T10:00:00.000Z");
  });
  it("never exports the key ciphertext", () => {
    for (const [table, columns] of Object.entries(EXPORT_TABLES)) {
      assert.ok(!columns.split(",").map((c) => c.trim()).includes("ciphertext"), `${table} exports ciphertext`);
    }
    assert.equal(EXPORT_TABLES.user_provider_keys, "provider, last4, options, status, created_at, rotated_at");
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

describe("account export paging", () => {
  it("exports every row of a person with more than 1000 rows, and only their own", async () => {
    const mine = Array.from({ length: 1200 }, (_, i) => ({ id: `u${i}`, user_id: "me", kind: "search" }));
    const theirs = Array.from({ length: 1200 }, (_, i) => ({ id: `x${i}`, user_id: "other", kind: "deep" }));
    const rows = await loadExportRows(cappedSupabase({ usage_events: [...mine, ...theirs], watchlists: [{ id: "w1", user_id: "me" }] }), "me");
    assert.equal(rows.usage_events?.length, 1200);
    assert.ok(rows.usage_events?.every((r) => (r as { user_id: string }).user_id === "me"));
    assert.equal(rows.watchlists?.length, 1);
    assert.deepEqual(rows.alerts, []);
  });
});
