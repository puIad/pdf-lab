// lib/sources/gtrends/index.ts — Google Trends adapter module barrel.
export {
  CACHE_TTL_MS,
  GTRENDS_GEO_DEFAULT,
  GTRENDS_KEY,
  GTRENDS_WINDOW_DAYS,
  GTrendsAdapter,
  MIN_INTERVAL_MS,
  gtrendsConfigFromEnv,
} from "./gtrends-adapter.ts";
export type {
  GTrendsAdapterConfig,
  GTrendsPayload,
  InterestOverTimePayload,
  RelatedQueryPayload,
  TrendsBackend,
} from "./gtrends-adapter.ts";
