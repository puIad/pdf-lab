import test from "node:test";
import assert from "node:assert/strict";
import { runYouTubeRetention, type RetentionStore, type StaleSignal } from "./youtube-retention.ts";
import { YouTubeAdapter } from "../sources/youtube/youtube-adapter.ts";

const NOW = Date.parse("2026-11-20T00:00:00Z");
const day = 86_400_000;

function fakeStore(rows: Array<StaleSignal & { collected_at: number; content: string }>) {
  const store: RetentionStore = {
    async listStale(cutoffIso, limit, exclude) {
      const cutoff = Date.parse(cutoffIso);
      return rows.filter((r) => r.collected_at < cutoff && !exclude.includes(r.id)).slice(0, limit);
    },
    async update(id, patch) {
      const r = rows.find((x) => x.id === id)!;
      r.content = patch.content ?? "";
      r.engagement = patch.engagement;
      r.collected_at = Date.parse(patch.collected_at);
    },
    async remove(ids) {
      for (const id of ids) rows.splice(rows.findIndex((x) => x.id === id), 1);
    },
  };
  return store;
}

const seed = () => [
  { id: "a", external_id: "yt_comment_a", engagement: { upvotes: 1, comments: 4 }, collected_at: NOW - 31 * day, content: "old a" },
  { id: "b", external_id: "yt_comment_b", engagement: { upvotes: 2, comments: 0 }, collected_at: NOW - 45 * day, content: "old b" },
  { id: "c", external_id: "yt_comment_c", engagement: {}, collected_at: NOW - 5 * day, content: "fresh c" },
];

function apiReturning(ids: string[], status = 200) {
  return async (url: string | URL) => {
    if (status !== 200) return new Response("{}", { status });
    const asked = new URL(String(url)).searchParams.get("id")!.split(",");
    const items = asked
      .filter((id) => ids.includes(id))
      .map((id) => ({ id, snippet: { videoId: "v", textOriginal: `new ${id}`, likeCount: 9, publishedAt: "2026-01-01T00:00:00Z" } }));
    return new Response(JSON.stringify({ items }));
  };
}

test("stale comments are refreshed or deleted; fresh ones stay; none older than 30 days remain", async () => {
  const rows = seed();
  const adapter = new YouTubeAdapter({ apiKey: "k", minIntervalMs: 0, nowFn: () => NOW, fetchFn: apiReturning(["a"]) });
  const res = await runYouTubeRetention({ store: fakeStore(rows), refresher: adapter, now: () => NOW });
  assert.deepEqual({ examined: res.examined, refreshed: res.refreshed, deleted: res.deleted }, { examined: 2, refreshed: 1, deleted: 1 });
  assert.deepEqual(rows.map((r) => r.id).sort(), ["a", "c"]);
  const a = rows.find((r) => r.id === "a")!;
  assert.equal(a.content, "new a");
  assert.deepEqual(a.engagement, { upvotes: 9, comments: 4 }); // reply count kept
  assert.ok(rows.every((r) => r.collected_at >= NOW - 30 * day));
});

test("a failed refresh deletes the batch", async () => {
  const rows = seed();
  const adapter = new YouTubeAdapter({ apiKey: "k", minIntervalMs: 0, nowFn: () => NOW, fetchFn: apiReturning([], 500) });
  const res = await runYouTubeRetention({ store: fakeStore(rows), refresher: adapter, now: () => NOW });
  assert.equal(res.deletedOnFailure, 2);
  assert.match(res.error ?? "", /500/);
  assert.deepEqual(rows.map((r) => r.id), ["c"]);
});

test("no API key: stale rows are deleted, never kept", async () => {
  const rows = seed();
  const adapter = new YouTubeAdapter({ minIntervalMs: 0, nowFn: () => NOW });
  await runYouTubeRetention({ store: fakeStore(rows), refresher: adapter, now: () => NOW });
  assert.deepEqual(rows.map((r) => r.id), ["c"]);
});
