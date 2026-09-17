// lib/sources/reddit/index.ts — Reddit adapter module barrel.
export {
  ANONYMOUS_AUTHOR,
  CACHE_TTL_MS,
  DEFAULT_AUTHOR_SALT,
  DEFAULT_USER_AGENT,
  MIN_INTERVAL_MS,
  REDDIT_KEY,
  RedditAdapter,
  hashRedditAuthor,
  redditConfigFromEnv,
} from "./reddit-adapter.ts";
export type { RedditAdapterConfig, RedditPostData } from "./reddit-adapter.ts";
