// lib/sources/index.ts — pipeline entrypoint: registers all adapters.
// Pipeline code imports from here (or ./registry); it never imports an
// adapter module directly (docs/08-ADAPTERS.md rule 1).

import { RedditAdapter, redditConfigFromEnv } from "./reddit/index.ts";
import { registerAdapter } from "./registry.ts";

registerAdapter(new RedditAdapter(redditConfigFromEnv()));

export { adapterKeys, getAdapter, listAdapters, registerAdapter } from "./registry.ts";
export type {
  CollectInput,
  HealthStatus,
  MarketSignal,
  RawSignal,
  SignalEngagement,
  SourceAdapter,
} from "./types.ts";
