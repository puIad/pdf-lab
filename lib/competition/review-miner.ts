// lib/competition/review-miner.ts — Review mining & product gap extraction per PRD §21.
// Mines likes, dislikes, missing, confusing, requests and translates them into actionable product gaps.
// Every gap traces to quoted review or discussion excerpts; no match means no gap.

import type {
  CompetitorProduct,
  MinedReviewCategories,
  ProductGap,
  QuotedReviewExcerpt,
} from "./types.ts";

export interface ReviewSourceSignal {
  title?: string | null;
  content?: string | null;
  url?: string | null;
  source_type?: string | null;
}

interface MiningPattern {
  category: ProductGap["category"];
  sentiment: "dislike" | "missing" | "confusing" | "request" | "like";
  regex: RegExp;
  /** Request wording only means something in a person's own words, never in a listing's marketing text. */
  discussionOnly?: boolean;
  gapTitle: string;
  gapSummary: string;
  opportunityTranslation: string;
}

// Up to two adjectives between the article and the material ("a good simple checklist"), never a
// determiner or possessive: "a reason the guide skips step 3" asks about an existing guide.
const FILLER = String.raw`(?:(?!(?:the|this|that|these|those|your|my|his|her|their)\b)\w+ ){0,2}`;
// Ends on a word boundary after an optional plural: "guide" must not match "guideline".
const ASKED_FOR = String.raw`(?:checklist|guide|template|cheat ?sheet|printable|pdf|flowchart|workbook|tracker|step.by.step (?:list|guide))s?\b`;

// Niche-neutral wording only (Part 6.4): the texts describe the pattern, the quoted excerpts carry
// the niche. A category with no matching excerpt produces no gap.
const MINING_PATTERNS: MiningPattern[] = [
  {
    category: "too_technical",
    sentiment: "dislike",
    regex: /\b(too technical|way too complex|jargon|dense manual|hard to understand|assumed i knew|overly complicated)\b/i,
    gapTitle: "Too technical for the reader",
    gapSummary: "Quoted users say existing material is too technical or assumes knowledge they do not have.",
    opportunityTranslation: "A plain-language version that explains each term and step without jargon.",
  },
  {
    category: "confusing",
    sentiment: "confusing",
    regex: /\b(confusing|unclear instructions|lost at step|hard to follow|vague|did not explain how|ambiguous)\b/i,
    gapTitle: "Hard to follow",
    gapSummary: "Quoted users say existing material is confusing or unclear about what to do next.",
    opportunityTranslation: "A clearly sequenced version with one action per step.",
  },
  {
    category: "missing_feature",
    sentiment: "missing",
    regex: /\b(missing|lacks|wish it had|did not include|didn['’]t cover|needs more (?:diagrams|examples|detail))\b/i,
    gapTitle: "Something users expected is missing",
    gapSummary: "Quoted users name content they expected and did not find.",
    opportunityTranslation: "Cover the missing content named in the quotes.",
  },
  {
    category: "offline_access",
    sentiment: "request",
    regex: /\b(offline|printable|print it|no internet|phone friendly|laminated)\b/i,
    gapTitle: "Wanted offline or on paper",
    gapSummary: "Quoted users ask for something they can print or use without a connection.",
    opportunityTranslation: "A compact printable version that works offline.",
  },
  {
    category: "outdated",
    sentiment: "dislike",
    regex: /\b(outdated|out of date|old version|obsolete|no longer (?:works|applies|accurate))\b/i,
    gapTitle: "Out of date",
    gapSummary: "Quoted users say existing material no longer matches the current situation.",
    opportunityTranslation: "An up-to-date version, checked against how things work now.",
  },
  {
    // Issue #93 (DEC-020 b): video comments and forum posts rarely complain about existing material;
    // they ask whether some exists. A request for a checklist, guide or template is a gap only as quoted.
    category: "requested_material",
    sentiment: "request",
    regex: new RegExp(
      String.raw`\b(?:${[
        String.raw`is there (?:a|an|any) ${FILLER}${ASKED_FOR}`,
        String.raw`does anyone (?:have|know (?:of|where to find)) (?:a|an|any) ${FILLER}${ASKED_FOR}`,
        String.raw`(?:i|we) wish (?:there (?:was|were)|someone (?:made|had)) (?:a|an|some) ${FILLER}${ASKED_FOR}`,
        String.raw`(?:i(?:['’]m| am)|we(?:['’]re| are)) looking for (?:a|an|some) ${FILLER}${ASKED_FOR}`,
        String.raw`where can (?:i|we) (?:find|get) (?:a|an) ${FILLER}${ASKED_FOR}`,
      ].join("|")})`,
      "i",
    ),
    discussionOnly: true,
    gapTitle: "Asked for, not found",
    gapSummary: "Quoted people ask whether a checklist, guide or template exists, or wish for one.",
    opportunityTranslation: "The checklist, guide or template the quotes ask for.",
  },
];

const LIKES_REGEX = /\b(helpful|lifesaver|easy to follow|easy reference|well organized|worth every penny)\b/i;

/**
 * Extracts a concise, readable sentence around a keyword match to serve as an authentic quote.
 */
function extractQuotedSentence(text: string, regex: RegExp): string | null {
  const match = regex.exec(text);
  if (!match) return null;

  const matchIdx = match.index;
  // Find sentence boundaries around the match
  const start = Math.max(0, text.lastIndexOf(".", matchIdx) + 1, text.lastIndexOf("\n", matchIdx) + 1);
  let end = text.indexOf(".", matchIdx);
  if (end === -1) end = text.length;
  else end = end + 1;

  let sentence = text.slice(start, end).trim();
  // Strip excessive spaces or leading bullet chars
  sentence = sentence.replace(/^[-*•\s]+/, "").trim();

  if (sentence.length > 220) {
    sentence = sentence.slice(0, 217) + "...";
  }

  return sentence.length >= 10 ? sentence : null;
}

export function mineReviewsAndGaps(
  competitors: CompetitorProduct[],
  signals: ReviewSourceSignal[] = [],
): {
  reviewMining: MinedReviewCategories;
  productGaps: ProductGap[];
} {
  const likes: Set<string> = new Set();
  const dislikes: Set<string> = new Set();
  const missing: Set<string> = new Set();
  const confusing: Set<string> = new Set();
  const requests: Set<string> = new Set();

  const gapExcerptsMap = new Map<string, QuotedReviewExcerpt[]>();

  // Gather text candidates from competitor review snippets and signals
  const textCandidates: Array<{
    text: string;
    source: string;
    url: string | null;
    origin: "listing" | "discussion";
  }> = [];

  for (const c of competitors) {
    const url = c.url;
    const sourceName = `${c.platform}: ${c.title}`;
    if (c.reviews && c.reviews.length > 0) {
      for (const rev of c.reviews) {
        textCandidates.push({ text: rev, source: sourceName, url, origin: "listing" });
      }
    }
    if (c.positioning) {
      textCandidates.push({ text: c.positioning, source: sourceName, url, origin: "listing" });
    }
  }

  for (const s of signals) {
    if (s.content) {
      textCandidates.push({
        text: s.content,
        source: s.source_type ? `${s.source_type}: ${s.title || "signal"}` : s.title || "User Discussion",
        url: s.url || null,
        origin: "discussion",
      });
    }
  }

  // Scan against mining patterns
  for (const candidate of textCandidates) {
    for (const pat of MINING_PATTERNS) {
      if (pat.discussionOnly && candidate.origin !== "discussion") continue;
      if (pat.regex.test(candidate.text)) {
        const sentence = extractQuotedSentence(candidate.text, pat.regex);
        if (sentence) {
          const excerpt: QuotedReviewExcerpt = {
            quote: sentence,
            source: candidate.source,
            url: candidate.url,
            sentiment: pat.sentiment,
            origin: candidate.origin,
          };

          if (!gapExcerptsMap.has(pat.category)) {
            gapExcerptsMap.set(pat.category, []);
          }
          const list = gapExcerptsMap.get(pat.category)!;
          if (list.length < 3 && !list.some((item) => item.quote === sentence)) {
            list.push(excerpt);
          }

          // Bucket into review categories
          if (pat.sentiment === "dislike") dislikes.add(sentence);
          else if (pat.sentiment === "missing") missing.add(sentence);
          else if (pat.sentiment === "confusing") confusing.add(sentence);
          else if (pat.sentiment === "request") requests.add(sentence);
        }
      }
    }

    // Check for positive signals (likes)
    if (LIKES_REGEX.test(candidate.text)) {
      const positiveSentence = extractQuotedSentence(candidate.text, LIKES_REGEX);
      if (positiveSentence && likes.size < 5) {
        likes.add(positiveSentence);
      }
    }
  }

  // Construct structured ProductGaps
  const productGaps: ProductGap[] = [];

  for (const pat of MINING_PATTERNS) {
    const excerpts = gapExcerptsMap.get(pat.category) || [];
    if (excerpts.length > 0) {
      productGaps.push({
        id: `gap-${pat.category}`,
        title: pat.gapTitle,
        category: pat.category,
        summary: pat.gapSummary,
        opportunityTranslation: pat.opportunityTranslation,
        reviewExcerpts: excerpts,
      });
    }
  }

  // No fallback: text with no pattern match yields no gap (EVIDENCE-CONTRACT, QC Rule 3).
  return {
    reviewMining: {
      likes: Array.from(likes).slice(0, 5),
      dislikes: Array.from(dislikes).slice(0, 5),
      missing: Array.from(missing).slice(0, 5),
      confusing: Array.from(confusing).slice(0, 5),
      requests: Array.from(requests).slice(0, 5),
    },
    productGaps,
  };
}
