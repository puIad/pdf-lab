// lib/sources/autocomplete/index.ts — search-suggestion adapter module barrel (local-only, DEC-008).
export {
  AUTOCOMPLETE_KEY,
  AutocompleteAdapter,
  CACHE_TTL_MS,
  ENGINES,
  MODIFIERS,
  QUESTION_PREFIXES,
  autocompleteConfigFromEnv,
  expansionPlan,
  parseSuggestions,
  suggestUrl,
} from "./autocomplete-adapter.ts";
export type { AutocompleteAdapterConfig, Engine, SuggestionPayload } from "./autocomplete-adapter.ts";
