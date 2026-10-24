// lib/ideas/seeds.ts — scan regions + starter seed groups for /ideas (Phase 3 Part 3.7, DEC-010).
// A seed only starts a live scan: no idea, number or label is pre-written here (QC Rule 1).

/** English-language markets only: Wikipedia and the Serper / suggest language (`hl=en`) stay English. */
export const REGIONS = [
  { code: "us", label: "United States" },
  { code: "gb", label: "United Kingdom" },
  { code: "ca", label: "Canada" },
  { code: "au", label: "Australia" },
  { code: "in", label: "India" },
  { code: "nz", label: "New Zealand" },
  { code: "ie", label: "Ireland" },
  { code: "za", label: "South Africa" },
  { code: "ng", label: "Nigeria" },
  { code: "ph", label: "Philippines" },
  { code: "sg", label: "Singapore" },
] as const;
export type RegionCode = (typeof REGIONS)[number]["code"];
export const DEFAULT_REGION: RegionCode = "us";

export function isRegion(v: unknown): v is RegionCode {
  return REGIONS.some((r) => r.code === v);
}

/**
 * Groups are PDFMakerHub's 21 catalog categories (pdfmakerhub.com/ideas.js, read 2026-10-24).
 * Seeds: PDFMinter's 32 suggested seeds (pdfminter.com home, read 2026-10-24), each placed in the
 * closest category; categories PDFMinter has no seed for get two broad PDF Lab topics.
 * shortcut: unreviewed list; the user reviews it (DEC-010), then it can move to a table.
 */
export const STARTER_SEEDS: ReadonlyArray<{ group: string; seeds: readonly string[] }> = [
  { group: "Health & Wellness", seeds: ["keto diet", "intermittent fasting"] },
  { group: "Fitness & Workouts", seeds: ["strength training for women"] },
  { group: "Food & Recipes", seeds: ["meal prep"] },
  { group: "Mental Health", seeds: ["anxiety relief", "self care"] },
  { group: "Money & Finance", seeds: ["budgeting", "credit score", "debt payoff"] },
  { group: "Business & Entrepreneurship", seeds: ["side hustle", "etsy shop", "freelancing"] },
  { group: "Marketing & Social", seeds: ["social media marketing", "email marketing"] },
  { group: "Career & Job Search", seeds: ["resume writing", "job interview", "linkedin profile", "remote work"] },
  { group: "Parenting & Family", seeds: ["toddler sleep", "potty training", "homeschool"] },
  { group: "Pregnancy & Baby", seeds: ["baby led weaning"] },
  { group: "Home & Lifestyle", seeds: ["decluttering", "container gardening", "cleaning schedule", "small space organization", "moving checklist"] },
  { group: "Productivity", seeds: ["morning routine", "journaling"] },
  { group: "Travel", seeds: ["packing list"] },
  { group: "Relationships & Dating", seeds: ["wedding planning"] },
  { group: "Pets", seeds: ["puppy training"] },
  { group: "Beauty & Fashion", seeds: ["skincare routine", "capsule wardrobe"] },
  { group: "Creative & Hobbies", seeds: ["crochet", "watercolor painting"] },
  { group: "Education & Study", seeds: ["study tips", "exam preparation"] },
  { group: "Faith", seeds: ["bible study", "prayer journal"] },
  { group: "Spirituality", seeds: ["meditation", "manifestation"] },
  { group: "Tech & AI", seeds: ["chatgpt prompts", "home network setup"] },
];
