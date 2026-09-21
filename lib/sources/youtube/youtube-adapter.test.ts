// lib/sources/youtube/youtube-adapter.test.ts — Unit tests for YouTube adapter
import test from "node:test";
import assert from "node:assert/strict";
import {
  YouTubeAdapter,
  hashYouTubeAuthor,
  YOUTUBE_KEY,
  DEFAULT_AUTHOR_SALT,
} from "./youtube-adapter.ts";

test("hashYouTubeAuthor hashes username with salt without leaking raw identity", () => {
  const hash = hashYouTubeAuthor("TechExplorer42", DEFAULT_AUTHOR_SALT);
  assert.match(hash, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(hash, /TechExplorer42/);

  // Anonymous / empty returns anonymous
  assert.equal(hashYouTubeAuthor(null), "anonymous");
  assert.equal(hashYouTubeAuthor(""), "anonymous");
  assert.equal(hashYouTubeAuthor("[deleted]"), "anonymous");
});

test("YouTubeAdapter collects fallback signals when unauthenticated", async () => {
  const adapter = new YouTubeAdapter({
    authorSalt: "test-salt",
  });

  const health = await adapter.healthCheck();
  assert.equal(health.ok, true);
  assert.match(health.detail || "", /unauthenticated/);

  const rawSignals = await adapter.collect({
    query: "pc troubleshooting",
    limit: 3,
  });

  assert.equal(rawSignals.length, 3);
  assert.equal(rawSignals[0].source, YOUTUBE_KEY);
  assert.ok(rawSignals[0].externalId.startsWith("yt_fallback_"));

  // Normalize check
  const normalized = adapter.normalize(rawSignals[0]);
  assert.equal(normalized.source, YOUTUBE_KEY);
  assert.match(normalized.author || "", /^sha256:/);
  assert.ok(normalized.title && normalized.title.length > 0);
  assert.ok(normalized.text && normalized.text.length > 0);
  assert.ok(typeof normalized.engagement.upvotes === "number");
  assert.ok(typeof normalized.engagement.comments === "number");
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
