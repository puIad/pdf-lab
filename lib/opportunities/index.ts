// lib/opportunities/index.ts — Public entrypoint for opportunities module.

export {
  ALLOWED_FORMATS,
  OPPORTUNITY_PROMPT_VERSION,
  SOPHISTICATION_LEVELS,
  URGENCY_LEVELS,
} from "./types.ts";

export type {
  DiversificationStats,
  GeneratedOpportunity,
  OpportunityFormat,
  OpportunityMarketInput,
  OpportunityRow,
  OpportunitySignalInput,
  SophisticationLevel,
  UrgencyLevel,
} from "./types.ts";

export {
  computeDiversificationStats,
  generate25Opportunities,
  generateCandidatePool,
  selectDiversifiedOpportunities,
} from "./generator.ts";

export type {
  GenerateOpportunitiesOptions,
  GenerationResult,
} from "./generator.ts";
