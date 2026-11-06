// lib/brief/types.ts — build-ready brief (Phase 3 Part 3.10, DEC-010 items 10 to 14).
// Three layers, kept apart for QC Rule 5:
//   facts        each line cites stored evidence (evidence rows, signals, listings);
//   suggestions  derived by fixed rules from cited facts (outline, listing copy, bonus angles);
//   AI notes     written on demand by the cheap tier, each citing evidence ids from this brief.

import type { ValidationVerdict } from "../planner/verdict.ts";

export interface BriefCite {
  /** Evidence row id, competitor id, or signal external id. */
  id: string;
  source: string;
  url: string | null;
}

/** A line that states something observed. Never without cites. */
export interface BriefFact {
  text: string;
  cites: BriefCite[];
}

export interface BriefAiNote {
  text: string;
  /** Ids of BriefCite entries in this brief the note relies on. */
  citeIds: string[];
  provider: string;
  model: string;
}

export interface BriefSection {
  heading: string;
  /** Phrase the heading came from, or null for a format default heading. */
  fromPhrase: string | null;
}

export interface BriefMarketplace {
  platform: string;
  label: string;
  listings: number;
  withReviews: number;
  reviews: number;
}

export type BriefSource =
  | { kind: "opportunity"; id: string }
  | { kind: "idea"; seed: string; phrase: string };

export interface Brief {
  source: BriefSource;
  title: string;
  format: string;
  promise: BriefFact;
  audience: BriefFact | null;
  outline: BriefSection[];
  buyerLanguage: BriefFact[];
  keywords: BriefFact[];
  whereToSell: { marketplaces: BriefMarketplace[]; fact: BriefFact } | null;
  priceAnchor: BriefFact | null;
  listing: { etsyTitle: string; etsyTags: string[] };
  bonusAngles: BriefFact[];
  /** Not-professional-advice note when the topic is health, money or legal. */
  adviceNote: string | null;
  /** Validate verdict for a quick idea (GO or WAIT; KILL never gets a brief). */
  verdict: ValidationVerdict | null;
  /** Keyed by section heading, plus "description" for the listing description. */
  notes: Record<string, BriefAiNote>;
  generatedAt: string;
}

export const DESCRIPTION_KEY = "description";
