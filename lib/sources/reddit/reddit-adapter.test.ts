// lib/sources/reddit/reddit-adapter.test.ts — unit tests, zero network.
// Run: `pnpm test` (node:test + node:assert, no extra dependencies).
// Fixture is labeled SAMPLE DATA (see __fixtures__/search-response.json) and
// never touches the DB — per docs/06-EVIDENCE-CONTRACT.md fixture rule.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ANONYMOUS_AUTHOR,
  RedditAdapter,
  hashRedditAuthor,
} from "./reddit-adapter.ts";
import type { RedditAdapterConfig } from "./reddit-adapter.ts";

const FIXTURE_URL = new URL("./__fixtures__/search-response.json", import.meta.url);
const FIXTURE = JSON.parse(readFileSync(FIXTURE_URL, "utf8")) as {
  _fixture: string;
  data: { children: Array<{ data: Record<string, unknown> }> };
};

function testConfig(
  fetchFn: RedditAdapterConfig["fetchFn"],
): RedditAdapterConfig {
  return {
    userAgent: "pdf-lab-test/1.1",
    authorSalt: "test-salt-v1",
    minIntervalMs: 0,
    cacheTtlMs: 60_000,
    fetchFn,
    nowFn: () => 1758000000000,
  };
}

function stubFetch(responses: Response[]): {
  fetchFn: RedditAdapterConfig["fetchFn"];
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let i = 0;
  const fetchFn: RedditAdapterConfig["fetchFn"] = async (input, init) => {
    calls.push({ url: String(input), init });
    const res = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return res;
  };
  return { fetchFn, calls };
}

function listingResponse(): Response {
  return new Response(JSON.stringify(FIXTURE), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-ratelimit-remaining": "59",
    },
  });
}

describe("hashRedditAuthor", () => {
  it("hashes a username deterministically and never returns it", () => {
    const a = hashRedditAuthor("FixtureUserOne", "test-salt-v1");
    const b = hashRedditAuthor("FixtureUserOne", "test-salt-v1");
    assert.equal(a, b);
    assert.match(a, /^sha256:[0-9a-f]{64}$/);
    assert.ok(!a.includes("FixtureUserOne"));
  });

  it("maps null/[deleted]/[removed] to anonymous", () => {
    assert.equal(hashRedditAuthor(null), ANONYMOUS_AUTHOR);
    assert.equal(hashRedditAuthor("[deleted]"), ANONYMOUS_AUTHOR);
    assert.equal(hashRedditAuthor("[removed]"), ANONYMOUS_AUTHOR);
  });
});

describe("RedditAdapter.normalize (labeled fixture)", () => {
  it("maps a self post to the signals row shape with hashed author", () => {
    const adapter = new RedditAdapter(testConfig(stubFetch([]).fetchFn));
    const signal = adapter.normalize({
      source: "reddit",
      externalId: "t3_fixpost1",
      fetchedAt: new Date(1758000000000).toISOString(),
      payload: FIXTURE.data.children[0].data,
    });
    assert.equal(signal.source, "reddit");
    assert.equal(signal.source_id, "t3_fixpost1");
    assert.equal(
      signal.url,
      "https://www.reddit.com/r/techsupport/comments/fixpost1/pc_keeps_crashing_when_gaming/",
    );
    assert.equal(signal.title, "PC keeps crashing when gaming — BSOD every 20 minutes");
    assert.ok(signal.text?.includes("blue screens"));
    assert.equal(signal.timestamp, new Date(1757800000 * 1000).toISOString());
    assert.equal(signal.engagement.upvotes, 42);
    assert.equal(signal.engagement.comments, 17);
    assert.equal(signal.engagement.subreddit, "techsupport");
    assert.match(String(signal.author), /^sha256:[0-9a-f]{64}$/);
    assert.equal(signal.engagement.author_hash, signal.author);
    assert.deepEqual(signal.market_candidates, []);
    assert.equal(signal.intent, null);
    assert.deepEqual(signal.pain_points, []);
    // No raw username anywhere in the normalized output.
    assert.ok(!JSON.stringify(signal).includes("FixtureUserOne"));
  });

  it("maps deleted authors to anonymous and empty selftext to null", () => {
    const adapter = new RedditAdapter(testConfig(stubFetch([]).fetchFn));
    const signal = adapter.normalize({
      source: "reddit",
      externalId: "t3_fixpost2",
      fetchedAt: new Date(1758000000000).toISOString(),
      payload: FIXTURE.data.children[1].data,
    });
    assert.equal(signal.author, ANONYMOUS_AUTHOR);
    assert.equal(signal.text, null);
    assert.equal(signal.title, "Best driver updater routine for Windows 11?");
  });

  it("rejects non-object payloads", () => {
    const adapter = new RedditAdapter(testConfig(stubFetch([]).fetchFn));
    assert.throws(
      () =>
        adapter.normalize({
          source: "reddit",
          externalId: "t3_x",
          fetchedAt: new Date(1758000000000).toISOString(),
          payload: null,
        }),
      /payload object/,
    );
  });
});

describe("RedditAdapter.collect (stubbed fetch, no network)", () => {
  it("uses public JSON fallback without creds and honors since", async () => {
    const { fetchFn, calls } = stubFetch([listingResponse()]);
    const adapter = new RedditAdapter(testConfig(fetchFn));
    assert.equal(adapter.usesOAuth, false);
    const items = await adapter.collect({
      query: "pc troubleshooting",
      limit: 10,
      since: new Date(1757600000 * 1000),
    });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.startsWith("https://www.reddit.com/search?"));
    assert.ok(calls[0].url.includes("raw_json%3D1") || calls[0].url.includes("raw_json=1"));
    assert.ok(!("Authorization" in (calls[0].init?.headers ?? {})));
    // fixpost3 (created_utc 1600000000) is older than `since` → dropped.
    assert.deepEqual(
      items.map((i) => i.externalId),
      ["t3_fixpost1", "t3_fixpost2"],
    );
    assert.ok(items.every((i) => i.source === "reddit"));
  });

  it("prefers app-only OAuth when credentials are set", async () => {
    const tokenResponse = new Response(
      JSON.stringify({ access_token: "tok123", expires_in: 3600 }),
      { status: 200 },
    );
    const { fetchFn, calls } = stubFetch([tokenResponse, listingResponse()]);
    const adapter = new RedditAdapter({
      ...testConfig(fetchFn),
      clientId: "id123",
      clientSecret: "shh",
    });
    assert.equal(adapter.usesOAuth, true);
    const items = await adapter.collect({ query: "pc troubleshooting", limit: 2 });
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.includes("access_token"));
    assert.ok(calls[1].url.startsWith("https://oauth.reddit.com/search?"));
    const headers = calls[1].init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer tok123");
    assert.equal(items.length, 2);
  });

  it("caches repeated queries within TTL (one HTTP call)", async () => {
    const { fetchFn, calls } = stubFetch([listingResponse()]);
    const adapter = new RedditAdapter(testConfig(fetchFn));
    await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    assert.equal(calls.length, 1);
  });

  it("healthCheck reports mode honestly and never throws", async () => {
    const { fetchFn } = stubFetch([listingResponse()]);
    const adapter = new RedditAdapter(testConfig(fetchFn));
    const status = await adapter.healthCheck();
    assert.equal(status.ok, true);
    assert.ok(status.detail?.includes("public-json"));
  });
});
