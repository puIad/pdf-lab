// lib/takedown/takedown.test.ts — URL keys for the takedown blocklist and the delete path (issue #76).

import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addTakedown, normalizeUrlKey, readBlockedKeys } from "./takedown.ts";

test("spellings of one page share a key", () => {
  const key = "etsy.com/listing/123/pdf-planner";
  for (const u of [
    "https://www.etsy.com/listing/123/pdf-planner",
    "http://ETSY.com/listing/123/pdf-planner/",
    "https://etsy.com/listing/123/pdf-planner?utm_source=a&ref=b#reviews",
    "https://www.google.com/url?q=https%3A%2F%2Fwww.etsy.com%2Flisting%2F123%2Fpdf-planner&sa=U",
  ]) assert.equal(normalizeUrlKey(u), key, u);
});

test("real query parameters stay, in sorted order; other pages differ", () => {
  assert.equal(normalizeUrlKey("https://a.com/p?b=2&a=1"), "a.com/p?a=1&b=2");
  assert.notEqual(normalizeUrlKey("https://a.com/p?id=1"), normalizeUrlKey("https://a.com/p?id=2"));
  assert.equal(normalizeUrlKey("https://a.com/"), "a.com");
  assert.notEqual(normalizeUrlKey("https://a.com/p?q=a%26b=c"), normalizeUrlKey("https://a.com/p?q=a&b=c"));
});

test("text that is not an http URL has no key", () => {
  for (const u of ["", null, undefined, "not a url", "ftp://a.com/x", "javascript:alert(1)"]) assert.equal(normalizeUrlKey(u), null);
});

/** Minimal fake of the query builder calls addTakedown makes. */
function fakeSupabase(tables: Record<string, Record<string, string | null>[]>) {
  const blocklist: unknown[] = [];
  const client = {
    from(table: string) {
      return {
        upsert: async (row: unknown) => (blocklist.push(row), { error: null }),
        select: () => ({
          or: () => ({ order: () => ({ range: async () => ({ data: tables[table].slice(), error: null }) }) }),
        }),
        delete: () => ({
          in: async (_c: string, ids: string[]) => {
            tables[table] = tables[table].filter((r) => !ids.includes(r.id as string));
            return { error: null };
          },
        }),
      };
    },
  };
  return { client: client as unknown as SupabaseClient, blocklist, tables };
}

test("a takedown deletes stored rows of every spelling and keeps other pages", async () => {
  const { client, blocklist, tables } = fakeSupabase({
    signals: [
      { id: "s1", url: "https://www.etsy.com/listing/1/x", external_id: "https://www.etsy.com/listing/1/x" },
      { id: "s2", url: "https://etsy.com/listing/2/y", external_id: "https://etsy.com/listing/2/y" },
    ],
    evidence: [{ id: "e1", url: "http://etsy.com/listing/1/x/?utm_medium=z" }, { id: "e2", url: null }],
    competitors: [{ id: "c1", url: "https://etsy.com/listing/1/x" }],
  });
  const out = await addTakedown(client, "https://etsy.com/listing/1/x", "owner request");
  assert.deepEqual(out, { urlKey: "etsy.com/listing/1/x", deleted: { signals: 1, evidence: 1, competitors: 1 } });
  assert.deepEqual(tables.signals.map((r) => r.id), ["s2"]);
  assert.deepEqual(tables.evidence.map((r) => r.id), ["e2"]);
  assert.deepEqual(tables.competitors, []);
  assert.equal(blocklist.length, 1);
});

test("a takedown of text that is not a URL stores nothing", async () => {
  const { client, blocklist } = fakeSupabase({ signals: [], evidence: [], competitors: [] });
  await assert.rejects(addTakedown(client, "etsy listing 1"), /http or https URL/);
  assert.equal(blocklist.length, 0);
});

function lookupClient(error: { code?: string; message: string } | null, rows: { url_key: string }[] = []) {
  return {
    from: () => ({ select: () => ({ in: async () => ({ data: error ? null : rows, error }) }) }),
  } as unknown as SupabaseClient;
}

test("a missing takedowns table reads as an empty blocklist; any other error throws", async () => {
  for (const code of ["PGRST205", "42P01"]) {
    assert.equal((await readBlockedKeys(lookupClient({ code, message: "missing" }), ["a.com"])).size, 0);
  }
  await assert.rejects(readBlockedKeys(lookupClient({ code: "57014", message: "timeout" }), ["a.com"]), /lookup failed: timeout/);
  await assert.rejects(readBlockedKeys(lookupClient({ message: "fetch failed" }), ["a.com"]), /lookup failed/);
  assert.deepEqual([...(await readBlockedKeys(lookupClient(null, [{ url_key: "a.com" }]), ["a.com"]))], ["a.com"]);
});
