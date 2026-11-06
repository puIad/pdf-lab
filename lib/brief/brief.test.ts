// lib/brief/brief.test.ts — build-ready brief (Part 3.10): Etsy limits, brief rules, AI note checks,
// Markdown + DOCX exports. Pure functions, zero network/DB. Inputs below are SAMPLE DATA (fixture rule).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ETSY_TAG_MAX, ETSY_TAGS_MAX, ETSY_TITLE_MAX, etsyProblems, etsyTags, etsyTitle } from "./etsy.ts";
import { acceptNotes, briefCites, buildBrief, priceAnchor, verbatim, type BriefInput } from "./build.ts";
import { briefBlocks, plainText } from "./blocks.ts";
import { noteEvidence, noteValidator, writeBriefNote } from "./notes.ts";
import { docxParagraphs, generateBriefDocx, generateBriefMarkdown } from "../export/brief.ts";
import type { AIRouter } from "../ai/router.ts";

const c = (id: string, source = "web") => ({ id, source, url: `https://example.com/${id}` });

function input(over: Partial<BriefInput> = {}): BriefInput {
  return {
    source: { kind: "idea", seed: "budgeting", phrase: "budget planner for beginners" },
    title: "Budget Planner for Beginners: A Ready-to-Use Planner",
    format: "Planner",
    mainPhrase: "budget planner for beginners",
    mainCites: [c("serp:1")],
    promise: { text: 'A planner that answers the search "budget planner for beginners"', cites: [c("serp:1")] },
    audience: { text: "young adults: 4 pain signals name this audience", cites: [c("sig-1", "reddit")] },
    related: [
      { phrase: "how to make a budget", opportunity: 70, cites: [c("serp:2")] },
      { phrase: "budget checklist", opportunity: 55, cites: [c("serp:3")] },
      { phrase: "monthly budget worksheet", opportunity: 60, cites: [c("serp:4")] },
      { phrase: "what is the 50/30/20 rule", opportunity: 65, cites: [c("serp:5")] },
    ],
    quotes: [
      { text: "“I never know where my paycheck goes.”", cites: [c("sig-1", "reddit")] },
      { text: "“uncited line”", cites: [] },
    ],
    competition: {
      marketplaces: [
        { platform: "etsy", label: "Etsy", listings: 2, withReviews: 1, reviews: 40 },
        { platform: "kdp", label: "Amazon KDP", listings: 0, withReviews: 0, reviews: 0 },
      ],
      cites: [c("ev-1", "etsy"), c("ev-2", "etsy"), { id: "ev-3", source: "kdp", url: null }],
    },
    prices: [
      { price: "$4.99", cite: c("ev-1", "etsy") },
      { price: "$12", cite: c("ev-2", "etsy") },
      { price: "Free", cite: c("ev-4", "gumroad") },
    ],
    gaps: [{ text: "no plan for irregular income (observed 3×)", cites: [c("sig-2", "reddit")] }],
    adviceText: "budget planner for beginners",
    verdict: null,
    now: new Date("2026-11-06T12:00:00Z"),
    ...over,
  };
}

describe("Etsy listing copy (limits re-verified 2026-11-06)", () => {
  it("keeps the title within 140 characters and Etsy's character rules", () => {
    const long = Array.from({ length: 30 }, (_, i) => `keyword phrase number ${i}`);
    const t = etsyTitle(["budget planner: 50% off & more + extras", "second: part & 10% + x", ...long]);
    assert.ok(t.length <= ETSY_TITLE_MAX, `${t.length}`);
    assert.deepEqual(etsyProblems(t, []), []);
    for (const ch of ["%", ":", "&", "+"]) assert.ok(t.split(ch).length <= 2, `${ch} used once at most`);
  });

  it("drops characters Etsy rejects and cuts a single over-long keyword at a word", () => {
    assert.equal(etsyTitle(["budget 🎉 planner"]), "Budget planner");
    const t = etsyTitle(["word ".repeat(40)]);
    assert.ok(t.length <= ETSY_TITLE_MAX && !t.endsWith(" "));
  });

  it("builds at most 13 unique tags of at most 20 characters from the keywords", () => {
    const kw = ["Budget Planner", "budget planner", "how to make a budget for beginners", "50/30/20 rule", "debt snowball", ...Array.from({ length: 20 }, (_, i) => `tag ${i}`)];
    const tags = etsyTags(kw);
    assert.ok(tags.length <= ETSY_TAGS_MAX);
    assert.ok(tags.every((t) => t.length <= ETSY_TAG_MAX));
    assert.deepEqual(etsyProblems("ok", tags), []);
    assert.equal(tags[0], "budget planner");
    assert.ok(tags.includes("50 30 20 rule"), "slashes are not allowed in tags");
    assert.equal(tags.filter((t) => t === "budget planner").length, 1);
  });

  it("splits a long keyword into two-word tags rather than dropping it", () => {
    assert.deepEqual(etsyTags(["how to make a budget for beginners"]), ["make budget", "budget beginners"]);
  });

  it("flags rule breaks", () => {
    assert.ok(etsyProblems("a".repeat(141), []).length > 0);
    assert.ok(etsyProblems("a: b: c", []).some((p) => p.includes(":")));
    assert.ok(etsyProblems("ok", ["x".repeat(21)]).length > 0);
    assert.ok(etsyProblems("ok", ["a", "A"]).includes("duplicate tags"));
    assert.ok(etsyProblems("ok", Array.from({ length: 14 }, (_, i) => `t${i}`)).length > 0);
  });
});

describe("buildBrief", () => {
  it("keeps every fact cited and drops uncited lines", () => {
    const b = buildBrief(input());
    assert.equal(b.buyerLanguage.length, 1);
    const facts = [b.promise, b.audience, ...b.buyerLanguage, ...b.keywords, b.whereToSell?.fact, b.priceAnchor, ...b.bonusAngles];
    for (const f of facts) assert.ok(f && f.cites.length > 0, JSON.stringify(f));
  });

  it("builds the outline from observed phrases with the format's defaults as filler", () => {
    const b = buildBrief(input());
    assert.equal(b.outline.length, 4);
    assert.ok(b.outline.some((s) => s.fromPhrase === "how to make a budget"));
    assert.ok(b.outline.every((s) => s.fromPhrase === null || input().related.some((r) => r.phrase === s.fromPhrase)));
  });

  it("lists marketplaces with counts, including one that answered with 0 listings", () => {
    const b = buildBrief(input());
    assert.match(b.whereToSell!.fact.text, /Etsy \(2 listings, 1 showing reviews\)/);
    assert.ok(!b.whereToSell!.fact.text.includes("KDP"));
    assert.equal(buildBrief(input({ competition: null })).whereToSell, null);
    const none = buildBrief(input({ competition: { marketplaces: [{ platform: "kdp", label: "Amazon KDP", listings: 0, withReviews: 0, reviews: 0 }], cites: [c("ev-3", "kdp")] } }));
    assert.equal(none.whereToSell!.fact.text, "0 listings observed on Amazon KDP");
  });

  it("anchors the price on the observed paid range, cited", () => {
    const p = priceAnchor(input().prices)!;
    assert.equal(p.text, "Observed $4.99 to $12 across 2 priced listings (median $8.50), plus 1 free");
    assert.equal(p.cites.length, 3);
    assert.equal(priceAnchor([]), null);
    assert.equal(priceAnchor([{ price: "Free", cite: c("x") }])!.text, "1 free listing observed, no paid price observed");
  });

  it("suggests add-ons in other formats from related phrases and gaps", () => {
    const b = buildBrief(input());
    const texts = b.bonusAngles.map((x) => x.text);
    assert.ok(texts.some((t) => t.startsWith("Add-on checklist") && t.includes("budget checklist")));
    assert.ok(texts.some((t) => t.startsWith("Add-on worksheet")));
    assert.ok(!texts.some((t) => t.startsWith("Add-on planner")), "the product's own format is not an add-on");
    assert.ok(texts.some((t) => t.includes("irregular income")));
  });

  it("treats spellings that differ only in punctuation as one search", () => {
    const base = input();
    const b = buildBrief(input({ related: [{ phrase: "budget planner for beginners?", opportunity: 90, cites: [c("serp:9")] }, ...base.related] }));
    assert.ok(!b.keywords.some((k) => k.text === "budget planner for beginners?"));
    assert.ok(!b.outline.some((s) => s.fromPhrase === "budget planner for beginners?"));
  });

  it("adds the not-advice note for flagged topics only", () => {
    assert.match(buildBrief(input()).adviceNote!, /not financial advice/);
    assert.equal(buildBrief(input({ adviceText: "packing checklist" })).adviceNote, null);
  });

  it("builds the Etsy copy from the brief's keywords within the limits", () => {
    const b = buildBrief(input());
    assert.deepEqual(etsyProblems(b.listing.etsyTitle, b.listing.etsyTags), []);
    assert.ok(b.listing.etsyTitle.toLowerCase().startsWith("budget planner for beginners"));
  });
});

describe("AI notes", () => {
  const brief = buildBrief(input());
  const items = noteEvidence(brief);

  it("numbers only cited lines and maps labels back to cite ids", () => {
    assert.ok(items.length > 0 && items.every((i, n) => i.label === `E${n + 1}`));
    const v = noteValidator(items);
    assert.deepEqual(v({ note: "Cover fixed costs first.", evidence: ["E1"] }), { text: "Cover fixed costs first.", citeIds: [items[0].citeId] });
  });

  it("rejects notes that cite nothing, cite unknown lines, or are empty", () => {
    const v = noteValidator(items);
    assert.throws(() => v({ note: "x", evidence: [] }), /cites no evidence/);
    assert.throws(() => v({ note: "x", evidence: ["E99"] }), /unknown evidence/);
    assert.throws(() => v({ note: "", evidence: ["E1"] }), /empty/);
  });

  it("writes a note through the router's cheap tier, refusing unknown headings", async () => {
    let tier = "";
    const router = {
      generateObject: async (req: { tier: string; validate: (raw: unknown) => unknown }) => {
        tier = req.tier;
        return { object: req.validate({ note: "Start with income.", evidence: ["E1", "E2"] }), provider: "stub", model: "stub-1" };
      },
    } as unknown as AIRouter;
    const n = await writeBriefNote(router, brief, brief.outline[0].heading);
    assert.equal(tier, "cheap");
    assert.equal(n.citeIds.length, 2);
    assert.ok(n.citeIds.every((id) => briefCites(brief).has(id)));
    await assert.rejects(() => writeBriefNote(router, brief, "Not a heading"), /no outline section/);
  });

  it("keeps client-sent notes only when every cite belongs to the brief", () => {
    const ok = { text: "fine", citeIds: ["serp:1"], provider: "p", model: "m" };
    const kept = acceptNotes(brief, {
      [brief.outline[0].heading]: ok,
      description: { ...ok, citeIds: ["made-up"] },
      "Unknown heading": ok,
    });
    assert.deepEqual(Object.keys(kept), [brief.outline[0].heading]);
    assert.deepEqual(acceptNotes(brief, "junk"), {});
  });
});

describe("brief exports", () => {
  const brief = buildBrief(
    input({
      notes: {},
      verdict: { verdict: "WAIT", reason: "Not yet proven: trend.", checks: [{ key: "demand", label: "Demand", status: "pass", count: "12 discussions", threshold: "≥ 10" }] },
    }),
  );
  brief.notes = acceptNotes(brief, { description: { text: "A calm, step-by-step planner & tracker <for> \"beginners\".", citeIds: ["sig-1"], provider: "p", model: "m" } });

  it("Markdown carries every block with links, in the layered order", () => {
    const md = generateBriefMarkdown(brief);
    assert.ok(md.startsWith(`# ${brief.title}\n`));
    for (const h of ["## Validate verdict", "## Not professional advice", "## Promise", "## Outline", "## Buyer language (verbatim)", "## Keywords", "## Where to sell", "## Price anchor", "## Listing copy", "## Bonus angles"]) {
      assert.ok(md.includes(`\n${h}\n`), h);
    }
    assert.ok(md.includes("[etsy 1](https://example.com/ev-1)"));
    assert.ok(md.includes("> AI interpretation (m): A calm"));
    assert.ok(!/\n- [^\n]*\n#/.test(md), "a list always ends before a heading");
  });

  it("DOCX opens as a zip and its text round-trips block by block", async () => {
    const file = await generateBriefDocx(brief);
    assert.equal(file.subarray(0, 2).toString("latin1"), "PK");
    const paras = docxParagraphs(file).filter((p) => p.length > 0);
    assert.deepEqual(paras, briefBlocks(brief).map(plainText));
  });
});

describe("verbatim", () => {
  it("keeps the first sentence or a word-cut slice", () => {
    assert.equal(verbatim("My budget never works out. Then I gave up."), "My budget never works out.");
    const v = verbatim("word ".repeat(80));
    assert.ok(v.length <= 221 && v.endsWith("…"));
  });
});
