// lib/sources/youtube/youtube-adapter.test.ts — Unit tests for YouTube adapter
import test from "node:test";
import assert from "node:assert/strict";
import {
  YouTubeAdapter,
  hashYouTubeAuthor,
  YOUTUBE_KEY,
  DEFAULT_AUTHOR_SALT,
} from "./youtube-adapter.ts";
import { SourceNotConfiguredError } from "../types.ts";

test("hashYouTubeAuthor hashes username with salt without leaking raw identity", () => {
  const hash = hashYouTubeAuthor("TechExplorer42", DEFAULT_AUTHOR_SALT);
  assert.match(hash, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(hash, /TechExplorer42/);

  // Anonymous / empty returns anonymous
  assert.equal(hashYouTubeAuthor(null), "anonymous");
  assert.equal(hashYouTubeAuthor(""), "anonymous");
  assert.equal(hashYouTubeAuthor("[deleted]"), "anonymous");
});

test("YouTubeAdapter without an API key is skipped, never returns template comments", async () => {
  let fetched = false;
  const adapter = new YouTubeAdapter({
    authorSalt: "test-salt",
    fetchFn: async () => {
      fetched = true;
      return new Response("{}");
    },
  });

  const health = await adapter.healthCheck();
  assert.equal(health.ok, false);
  assert.match(health.detail || "", /YOUTUBE_API_KEY/);

  await assert.rejects(
    adapter.collect({ query: "pc troubleshooting", limit: 3 }),
    (err: unknown) => err instanceof SourceNotConfiguredError && /YOUTUBE_API_KEY/.test(err.message),
  );
  assert.equal(fetched, false);
});

test("YouTubeAdapter normalizes explicit requests with high intent", async () => {
  const adapter = new YouTubeAdapter();
  const raw = {
    source: YOUTUBE_KEY,
    externalId: "yt_test_1",
    fetchedAt: "2026-09-21T00:00:00Z",
    payload: {
      commentId: "c1",
      videoId: "v1",
      text: "Can someone share a step-by-step PDF checklist for this setup?",
      author: "JaneDoe",
      likeCount: 45,
      replyCount: 5,
      publishedAt: "2026-09-20T12:00:00Z",
    },
  };

  const signal = adapter.normalize(raw);
  assert.equal(signal.intent, "very_strong");
  assert.equal(signal.url, "https://www.youtube.com/watch?v=v1&lc=c1");
  assert.equal(signal.engagement.upvotes, 45);
  assert.equal(signal.engagement.comments, 5);
});
