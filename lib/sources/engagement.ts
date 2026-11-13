// lib/sources/engagement.ts — which `signals.engagement` keys mean what, per adapter (Part 6.11).
// Scoring reads only the keys named here. `engagement` also holds ranks, positions, seeds, prices
// and window sizes; summing every number in it mixed those into "demand".

/** Reactions to one discussion, per source type. Keep in step with each adapter's `normalize`. */
export const DISCUSSION_ENGAGEMENT_KEYS: Record<string, string[]> = {
  reddit: ["upvotes", "comments"], // lib/sources/reddit: post score, num_comments
  youtube: ["upvotes", "comments"], // lib/sources/youtube: comment likeCount, replyCount
};

/**
 * Google Trends interest on its 0..100 scale: `avg_interest` on the interest-over-time summary row,
 * `interest_value` on a top related query. A rising related query stores a growth percentage in
 * `interest_value` and is excluded by its `rising` flag.
 */
export const TRENDS_INTEREST_KEYS = ["avg_interest", "interest_value"];
