// lib/sources/web/index.ts — web-search adapter module barrel.
export {
  CACHE_TTL_MS,
  MIN_INTERVAL_MS,
  PHRASE_BLOCKS,
  PHRASE_ID_PREFIX,
  SERPER_ENDPOINT,
  WEB_KEY,
  WebAdapter,
  parseResultDate,
  phrasePayloads,
  serperBody,
  webConfigFromEnv,
} from "./web-adapter.ts";
export type { PhraseBlock, SerperOrganicResult, SerperPhrasePayload, WebAdapterConfig } from "./web-adapter.ts";
