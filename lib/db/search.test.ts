// lib/db/search.test.ts — Unit tests for PostgREST search filter builder.

import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchFilter } from "./search.ts";

test("buildSearchFilter sanitizes and expands queries", async (t) => {
  await t.test("returns empty string for empty or whitespace query", () => {
    assert.equal(buildSearchFilter(""), "");
    assert.equal(buildSearchFilter("   "), "");
  });

  await t.test("strips commas, parentheses, and quotes that break PostgREST syntax", () => {
    const res = buildSearchFilter("pc, (troubleshooting)");
    // Should NOT have commas or parentheses inside the ilike patterns
    assert.ok(!res.includes(", "));
    assert.ok(!res.includes("("));
    assert.ok(!res.includes(")"));
    assert.ok(res.includes("title.ilike.%pc%"));
    assert.ok(res.includes("title.ilike.%troubleshooting%"));
  });

  await t.test("expands multi-word queries to phrase and individual keywords", () => {
    const res = buildSearchFilter("pc troubleshooting");
    const parts = res.split(",");
    assert.ok(parts.includes("title.ilike.%pc troubleshooting%"));
    assert.ok(parts.includes("content.ilike.%pc troubleshooting%"));
    assert.ok(parts.includes("title.ilike.%pc%"));
    assert.ok(parts.includes("title.ilike.%troubleshooting%"));
  });

  await t.test("escapes SQL LIKE special characters (% and _)", () => {
    const res = buildSearchFilter("100% working_now");
    assert.ok(res.includes("100\\%"));
    assert.ok(res.includes("working\\_now"));
  });
});
