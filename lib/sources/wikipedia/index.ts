// lib/sources/wikipedia/index.ts — Wikipedia pageviews adapter module barrel.
export {
  CACHE_TTL_MS,
  PRIOR_DAYS,
  RECENT_DAYS,
  WIKIPEDIA_KEY,
  WikipediaAdapter,
  titleMatches,
  wikipediaConfigFromEnv,
} from "./wikipedia-adapter.ts";
export type { PageviewsPayload, WikipediaAdapterConfig } from "./wikipedia-adapter.ts";
