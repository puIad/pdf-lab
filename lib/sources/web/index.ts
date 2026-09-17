// lib/sources/web/index.ts — web-search adapter module barrel.
export {
  CACHE_TTL_MS,
  MIN_INTERVAL_MS,
  SERPER_ENDPOINT,
  WEB_KEY,
  WebAdapter,
  parseResultDate,
  webConfigFromEnv,
} from "./web-adapter.ts";
export type { SerperOrganicResult, WebAdapterConfig } from "./web-adapter.ts";
