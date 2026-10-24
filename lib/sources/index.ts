// lib/sources/index.ts — pipeline entrypoint: registers all adapters.
// Pipeline code imports from here (or ./registry); it never imports an
// adapter module directly (docs/08-ADAPTERS.md rule 1).

import { RedditAdapter, redditConfigFromEnv } from "./reddit/index.ts";
import { GTrendsAdapter, gtrendsConfigFromEnv } from "./gtrends/index.ts";
import { WebAdapter, webConfigFromEnv } from "./web/index.ts";
import { EtsyAdapter, etsyConfigFromEnv } from "./etsy/index.ts";
import { GumroadAdapter, gumroadConfigFromEnv } from "./gumroad/index.ts";
import { KdpAdapter, kdpConfigFromEnv } from "./kdp/index.ts";
import { YouTubeAdapter, youtubeConfigFromEnv } from "./youtube/index.ts";
import { WikipediaAdapter, wikipediaConfigFromEnv } from "./wikipedia/index.ts";
import { AutocompleteAdapter, autocompleteConfigFromEnv } from "./autocomplete/index.ts";
import { registerAdapter } from "./registry.ts";

registerAdapter(new RedditAdapter(redditConfigFromEnv()));
registerAdapter(new GTrendsAdapter(gtrendsConfigFromEnv()));
registerAdapter(new WebAdapter(webConfigFromEnv()));
registerAdapter(new EtsyAdapter(etsyConfigFromEnv()));
registerAdapter(new GumroadAdapter(gumroadConfigFromEnv()));
registerAdapter(new KdpAdapter(kdpConfigFromEnv()));
registerAdapter(new YouTubeAdapter(youtubeConfigFromEnv()));
registerAdapter(new WikipediaAdapter(wikipediaConfigFromEnv()));
// Local-only (DEC-008): reports `skipped` unless PDFLAB_UNOFFICIAL_AUTOCOMPLETE=1 outside production.
registerAdapter(new AutocompleteAdapter(autocompleteConfigFromEnv()));

export { adapterKeys, getAdapter, listAdapters, registerAdapter } from "./registry.ts";
/** Whether the local-only autocomplete guard is open in this process (DEC-008). */
export const autocompleteEnabled = (): boolean => autocompleteConfigFromEnv().enabled;
export type {
  CollectInput,
  HealthStatus,
  MarketSignal,
  RawSignal,
  SignalEngagement,
  SourceAdapter,
} from "./types.ts";
export { SourceNotConfiguredError } from "./types.ts";
