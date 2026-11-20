// Part 5.2 acceptance: the vault stores keys encrypted and never shows them; a BYOK run is billed to the
// person's key and labelled; a refused key gives the fallback message and is marked revoked; the
// ledger rows add up to the calls the provider reported.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { randomBytes } from "node:crypto";
import { decryptKey } from "./crypto.ts";
import { createUserRouter } from "./user-router.ts";
import {
  activeKeys,
  deleteKey,
  KeyInputError,
  listKeys,
  saveKey,
  type KeyRow,
  type KeyStore,
} from "./vault.ts";
import { priceCall, totalLedger, type LedgerRow, type LedgerStore } from "../usage/ledger.ts";

const secret = randomBytes(32);
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const GEMINI_KEY = "AIzaSyTESTKEY-0000000000000000abcd";

function memoryKeys(): KeyStore & { rows: Map<string, KeyRow> } {
  const rows = new Map<string, KeyRow>();
  const k = (u: string, p: string) => `${u}/${p}`;
  return {
    rows,
    async get(u, p) {
      return rows.get(k(u, p)) ?? null;
    },
    async list(u) {
      return [...rows.values()].filter((r) => r.userId === u);
    },
    async put(r) {
      rows.set(k(r.userId, r.provider), r);
    },
    async remove(u, p) {
      return rows.delete(k(u, p));
    },
    async setStatus(u, p, status, detail) {
      const r = rows.get(k(u, p));
      if (r) rows.set(k(u, p), { ...r, status, statusDetail: detail });
    },
  };
}

function memoryLedger(): LedgerStore & { rows: LedgerRow[] } {
  const rows: LedgerRow[] = [];
  return { rows, async insert(r) { rows.push(r); } };
}

describe("key vault", () => {
  it("stores the key encrypted, shows only the last 4, and never returns it", async () => {
    const store = memoryKeys();
    const view = await saveKey(store, secret, { userId: USER, provider: "gemini", apiKey: GEMINI_KEY });
    const row = store.rows.get(`${USER}/gemini`)!;
    assert.ok(!row.ciphertext.includes(GEMINI_KEY) && !row.ciphertext.includes("TESTKEY"));
    assert.equal(decryptKey(secret, USER, "gemini", row.ciphertext), GEMINI_KEY);
    assert.equal(view.last4, "abcd");
    assert.ok(!JSON.stringify(await listKeys(store, USER)).includes("TESTKEY"));
    assert.ok(!JSON.stringify(view).includes(row.ciphertext));
  });

  it("a ciphertext copied to another user or provider does not decrypt", async () => {
    const store = memoryKeys();
    await saveKey(store, secret, { userId: USER, provider: "gemini", apiKey: GEMINI_KEY });
    const { ciphertext } = store.rows.get(`${USER}/gemini`)!;
    assert.throws(() => decryptKey(secret, OTHER, "gemini", ciphertext));
    assert.throws(() => decryptKey(secret, USER, "openrouter", ciphertext));
    assert.throws(() => decryptKey(randomBytes(32), USER, "gemini", ciphertext));
  });

  it("rotation replaces the key and reactivates a revoked one; delete removes it", async () => {
    const store = memoryKeys();
    await saveKey(store, secret, { userId: USER, provider: "gemini", apiKey: GEMINI_KEY });
    await store.setStatus(USER, "gemini", "revoked", "refused");
    const rotated = await saveKey(store, secret, { userId: USER, provider: "gemini", apiKey: "AIzaSyNEWKEY-1111111111111111wxyz" });
    assert.equal(rotated.status, "active");
    assert.equal(rotated.last4, "wxyz");
    assert.ok(rotated.rotatedAt);
    assert.equal((await activeKeys(store, secret, USER))[0].apiKey, "AIzaSyNEWKEY-1111111111111111wxyz");
    assert.equal(await deleteKey(store, USER, "gemini"), true);
    assert.equal(await deleteKey(store, USER, "gemini"), false);
    assert.deepEqual(await activeKeys(store, secret, USER), []);
  });

  it("rejects bad input and private endpoints", async () => {
    const store = memoryKeys();
    await assert.rejects(saveKey(store, secret, { userId: USER, provider: "nope", apiKey: GEMINI_KEY }), KeyInputError);
    await assert.rejects(saveKey(store, secret, { userId: USER, provider: "gemini", apiKey: "short" }), KeyInputError);
    await assert.rejects(saveKey(store, secret, { userId: USER, provider: "bedrock", apiKey: GEMINI_KEY }), /model/);
    for (const baseUrl of ["http://api.example.com/v1", "https://localhost/v1", "https://169.254.169.254/v1", "https://10.0.0.5/v1", "https://u:p@api.example.com"]) {
      await assert.rejects(saveKey(store, secret, { userId: USER, provider: "openai-compatible", apiKey: GEMINI_KEY, options: { baseUrl } }), KeyInputError, baseUrl);
    }
    const ok = await saveKey(store, secret, { userId: USER, provider: "openai-compatible", apiKey: GEMINI_KEY, options: { baseUrl: "https://api.example.com/v1/" } });
    assert.equal(ok.options.baseUrl, "https://api.example.com/v1");
  });
});

// A stand-in for every provider: Gemini answers per `geminiStatus`, the hosted OpenRouter always answers.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(geminiStatus: number, seen: string[] = []) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    seen.push(`${url} ${headers["x-goog-api-key"] ?? headers.Authorization ?? ""}`);
    if (url.includes("generativelanguage.googleapis.com")) {
      if (geminiStatus !== 200) return new Response(`{"error":"API key not valid"}`, { status: geminiStatus });
      return Response.json({
        candidates: [{ content: { parts: [{ text: `{"ok":true}` }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 },
        modelVersion: "gemini-2.5-flash",
      });
    }
    if (init?.method === "POST") {
      return Response.json({
        model: "openrouter/free",
        choices: [{ message: { content: `{"ok":true}` } }],
        usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
      });
    }
    return Response.json({ data: [] });
  }) as typeof fetch;
}

const HOSTED_ENV = { AI_CHEAP_PROVIDER: "openrouter", OPENROUTER_API_KEY: "hosted-key-9999" } as unknown as NodeJS.ProcessEnv;
const ok = (raw: unknown) => raw as { ok: boolean };

describe("per-request routing and the ledger", () => {
  it("a BYOK run uses the person's key, is labelled byok, and the ledger reconciles with the provider's usage", async () => {
    const keys = memoryKeys();
    const ledger = memoryLedger();
    await saveKey(keys, secret, { userId: USER, provider: "gemini", apiKey: GEMINI_KEY });
    const seen: string[] = [];
    stubFetch(200, seen);
    const { router, context, byokProviders } = await createUserRouter({ userId: USER, keys, ledger, secret: () => secret, env: HOSTED_ENV });
    context.runId = "33333333-3333-4333-8333-333333333333";
    assert.deepEqual(byokProviders, ["gemini"]);

    const results = [];
    for (let i = 0; i < 3; i++) results.push(await router.generateObject({ tier: "cheap", system: "s", user: "u", validate: ok }));
    for (const r of results) {
      assert.equal(r.keySource, "byok");
      assert.equal(r.provider, "byok-gemini");
      assert.equal(r.keyNotice, undefined);
    }
    // Every request carried the person's key, none the hosted one.
    assert.ok(seen.every((s) => s.endsWith(GEMINI_KEY)), seen.join("\n"));
    // Ledger: one row per call, all under the run, adding up to what the provider reported (3 x 120 tokens).
    assert.equal(ledger.rows.length, 3);
    const totals = totalLedger(ledger.rows);
    assert.equal(totals.calls, 3);
    assert.equal(totals.promptTokens, 300);
    assert.equal(totals.completionTokens, 60);
    assert.equal(totals.totalTokens, 360);
    assert.equal(totals.byKeySource.byok.calls, 3);
    assert.equal(totals.byKeySource.hosted.calls, 0);
    assert.ok(ledger.rows.every((r) => r.runId === context.runId && r.userId === USER && r.keySource === "byok"));
    // gemini-2.5-flash from the rate table: (100 x 0.30 + 20 x 2.50) / 1e6 per call.
    assert.equal(ledger.rows[0].costBasis, "table");
    assert.equal(ledger.rows[0].estimatedCostUsd, 0.00008);
    assert.equal(totals.estimatedCostUsd, 0.00024);
  });

  it("a person without a key runs on the hosted quota, labelled hosted", async () => {
    const ledger = memoryLedger();
    stubFetch(200);
    const { router } = await createUserRouter({ userId: USER, keys: memoryKeys(), ledger, secret: () => secret, env: HOSTED_ENV });
    const r = await router.generateObject({ tier: "cheap", system: "s", user: "u", validate: ok });
    assert.equal(r.keySource, "hosted");
    assert.equal(r.provider, "openrouter");
    assert.equal(ledger.rows[0].keySource, "hosted");
    assert.equal(ledger.rows[0].costBasis, "unpriced");
  });

  it("a revoked key gives the fallback message, the hosted quota answers, and the key is marked revoked", async () => {
    const keys = memoryKeys();
    const ledger = memoryLedger();
    await saveKey(keys, secret, { userId: USER, provider: "gemini", apiKey: GEMINI_KEY });
    stubFetch(401);
    const { router } = await createUserRouter({ userId: USER, keys, ledger, secret: () => secret, env: HOSTED_ENV });
    const r = await router.generateObject({ tier: "cheap", system: "s", user: "u", validate: ok });
    assert.equal(r.keySource, "hosted");
    assert.match(r.keyNotice ?? "", /gemini key was refused/);
    assert.match(r.keyNotice ?? "", /hosted quota/);
    assert.ok(!(r.keyNotice ?? "").includes("TESTKEY"));
    assert.equal(keys.rows.get(`${USER}/gemini`)!.status, "revoked");
    assert.equal(ledger.rows.length, 1); // the refused call used nothing; only the hosted answer is billed
    assert.equal(ledger.rows[0].keySource, "hosted");
    // The next request does not try the revoked key again.
    const again = await createUserRouter({ userId: USER, keys, ledger, secret: () => secret, env: HOSTED_ENV });
    assert.deepEqual(again.byokProviders, []);
  });

  it("without the vault secret the request still runs on the hosted quota", async () => {
    const keys = memoryKeys();
    await saveKey(keys, secret, { userId: USER, provider: "gemini", apiKey: GEMINI_KEY });
    stubFetch(200);
    const { router, byokProviders } = await createUserRouter({
      userId: USER, keys, ledger: memoryLedger(), secret: () => { throw new Error("KEY_VAULT_SECRET is not set"); }, env: HOSTED_ENV,
    });
    assert.deepEqual(byokProviders, []);
    assert.equal((await router.generateObject({ tier: "cheap", system: "s", user: "u", validate: ok })).keySource, "hosted");
  });

  it("a ledger failure never fails the call", async () => {
    stubFetch(200);
    const failing: LedgerStore = { async insert() { throw new Error("db down"); } };
    const { router } = await createUserRouter({ userId: null, keys: memoryKeys(), ledger: failing, secret: () => secret, env: HOSTED_ENV });
    const origError = console.error;
    console.error = () => {};
    try {
      assert.equal((await router.generateObject({ tier: "cheap", system: "s", user: "u", validate: ok })).object.ok, true);
    } finally {
      console.error = origError;
    }
  });

  it("prices a call: provider-reported first, then the table, else unpriced", () => {
    const u = (estimatedCostUsd: number) => ({ promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000, estimatedCostUsd });
    assert.deepEqual(priceCall({ model: "x/y", usage: u(0.5) }), { usd: 0.5, basis: "reported" });
    assert.deepEqual(priceCall({ model: "gpt-4o-mini", usage: u(0) }), { usd: 0.15, basis: "table" });
    assert.deepEqual(priceCall({ model: "mystery", usage: u(0) }), { usd: 0, basis: "unpriced" });
  });
});
