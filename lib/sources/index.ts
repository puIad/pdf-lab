// lib/sources/index.ts — pipeline entrypoint: registers all adapters.
// Pipeline code imports from here (or ./registry); it never imports an
// adapter module directly (docs/08-ADAPTERS.md rule 1).

import { RedditAdapter, redditConfigFromEnv } from "./reddit/index.ts";
import { GTrendsAdapter, gtrendsConfigFromEnv } from "./gtrends/index.ts";
import { WebAdapter, webConfigFromEnv } from "./web/index.ts";
import { EtsyAdapter, etsyConfigFromEnv } from "./etsy/index.ts";
import { GumroadAdapter, gumroadConfigFromEnv } from "./gumroad/index.ts";
import { KdpAdapter, kdpConfigFromEnv } from "./kdp/index.ts";
import { registerAdapter } from "./registry.ts";

registerAdapter(new RedditAdapter(redditConfigFromEnv()));
registerAdapter(new GTrendsAdapter(gtrendsConfigFromEnv()));
registerAdapter(new WebAdapter(webConfigFromEnv()));
registerAdapter(new EtsyAdapter(etsyConfigFromEnv()));
registerAdapter(new GumroadAdapter(gumroadConfigFromEnv()));
registerAdapter(new KdpAdapter(kdpConfigFromEnv()));

export { adapterKeys, getAdapter, listAdapters, registerAdapter } from "./registry.ts";
export type {
  CollectInput,
  HealthStatus,
  MarketSignal,
  RawSignal,
  SignalEngagement,
  SourceAdapter,
} from "./types.ts";
export { SourceNotConfiguredError } from "./types.ts";
