// lib/trends/test-fixtures.ts — TEST-ONLY sample topics. Invented text, never stored evidence.
// Production code must not import this file (the radar reads stored rows only, see
// docs/06-EVIDENCE-CONTRACT.md); `service.ts` has no default topics.

import type { MarketTopicData } from "./service.ts";

// Invented topics with YouTube + Reddit-shaped signals across 7d, 30d, 90d, 12m
export function getFixtureMarketTopics(): MarketTopicData[] {
  const now = Date.now();
  const DAY_MS = 86_400_000;

  return [
    {
      id: "m-pc-troubleshoot",
      name: "PC Troubleshooting & Diagnostic Trees",
      category: "tech",
      competitorCount: 2,
      signals: [
        // 7d burst (YouTube + Reddit)
        {
          id: "s1",
          sourceType: "youtube",
          title: "My PC won't POST and fans spin at max speed",
          content: "Is there a PDF diagnostic flowchart for boot beeps and error LEDs? Skipped step in video.",
          publishedAt: new Date(now - 2 * DAY_MS),
          engagement: { upvotes: 68, comments: 14 },
          intent: "very_strong",
        },
        {
          id: "s2",
          sourceType: "reddit",
          title: "BSOD WHEA_UNCORRECTABLE_ERROR after BIOS update",
          content: "Completely stuck on voltage configuration. Need a step-by-step clean rollback guide.",
          publishedAt: new Date(now - 3 * DAY_MS),
          engagement: { upvotes: 95, comments: 22 },
          intent: "strong",
        },
        {
          id: "s3",
          sourceType: "youtube",
          title: "GPU thermal paste replacement guide question",
          content: "Where can I get a checklist of screw sizes and thermal pad thicknesses?",
          publishedAt: new Date(now - 5 * DAY_MS),
          engagement: { upvotes: 41, comments: 8 },
          intent: "very_strong",
        },
        // 30d signals
        {
          id: "s4",
          sourceType: "reddit",
          title: "RAM timing crash checklist",
          content: "Wish someone made a printable BIOS tuning cheat sheet for DDR5 memory timings.",
          publishedAt: new Date(now - 18 * DAY_MS),
          engagement: { upvotes: 52, comments: 11 },
          intent: "strong",
        },
        {
          id: "s5",
          sourceType: "youtube",
          title: "No audio after Windows 11 update",
          content: "Driver cleanup steps are confusing in the video. Need a 5-minute troubleshooting flowchart.",
          publishedAt: new Date(now - 24 * DAY_MS),
          engagement: { upvotes: 33, comments: 6 },
          intent: "medium",
        },
        // 90d signals
        {
          id: "s6",
          sourceType: "reddit",
          title: "Systematic PC diagnostic procedure",
          content: "All troubleshooting videos on YouTube are unorganized clickbait. We need a verifiable procedure.",
          publishedAt: new Date(now - 75 * DAY_MS),
          engagement: { upvotes: 120, comments: 34 },
          intent: "very_strong",
        },
      ],
    },
    {
      id: "m-local-llm",
      name: "Local LLM Fine-Tuning on Consumer GPUs",
      category: "tech",
      competitorCount: 0, // Uncontested
      signals: [
        {
          id: "s7",
          sourceType: "youtube",
          title: "Fine-tuning Llama 3 on RTX 4070 VRAM out of memory",
          content: "The video doesn't explain quantization parameters. Where is a simple VRAM calculation matrix PDF?",
          publishedAt: new Date(now - 1 * DAY_MS),
          engagement: { upvotes: 112, comments: 28 },
          intent: "very_strong",
        },
        {
          id: "s8",
          sourceType: "reddit",
          title: "LoRA vs QLoRA config parameter cheatsheet?",
          content: "Can someone share a cheat sheet of tested learning rates and batch sizes for 8GB and 16GB cards?",
          publishedAt: new Date(now - 3 * DAY_MS),
          engagement: { upvotes: 144, comments: 35 },
          intent: "very_strong",
        },
        {
          id: "s9",
          sourceType: "youtube",
          title: "GGUF format conversion crash",
          content: "Stuck on llama.cpp quantization steps. Need a terminal command cheat sheet.",
          publishedAt: new Date(now - 4 * DAY_MS),
          engagement: { upvotes: 76, comments: 19 },
          intent: "strong",
        },
        {
          id: "s10",
          sourceType: "reddit",
          title: "Self-hosting Ollama with custom system prompts",
          content: "Looking for a curated Modelfile template collection for coding assistants.",
          publishedAt: new Date(now - 12 * DAY_MS),
          engagement: { upvotes: 88, comments: 16 },
          intent: "strong",
        },
      ],
    },
    {
      id: "m-creator-audio",
      name: "DaVinci Resolve Fairlight Audio Mixing Chains",
      category: "creator",
      competitorCount: 1,
      signals: [
        {
          id: "s11",
          sourceType: "youtube",
          title: "Dialogue EQ and multiband compression settings",
          content: "Is there a printable cheat sheet for voice frequency notches and compressor ratios?",
          publishedAt: new Date(now - 2 * DAY_MS),
          engagement: { upvotes: 85, comments: 17 },
          intent: "very_strong",
        },
        {
          id: "s12",
          sourceType: "reddit",
          title: "Clean audio mastering workflow in Fairlight",
          content: "Every YouTube tutorial uses paid plugins. Need a standard native plugin workflow checklist.",
          publishedAt: new Date(now - 6 * DAY_MS),
          engagement: { upvotes: 63, comments: 12 },
          intent: "strong",
        },
        {
          id: "s13",
          sourceType: "youtube",
          title: "Fix room echo and mic bleed",
          content: "The tutorial skipped how to set up sidechain ducking. Need a diagram.",
          publishedAt: new Date(now - 22 * DAY_MS),
          engagement: { upvotes: 49, comments: 9 },
          intent: "medium",
        },
      ],
    },
    {
      id: "m-tax-prep",
      name: "Freelancer & Creator Tax Deductions Guide",
      category: "finance",
      competitorCount: 4,
      signals: [
        {
          id: "s14",
          sourceType: "reddit",
          title: "Home office and equipment deduction checklist",
          content: "Does anyone have a comprehensive 1099 write-off checklist spreadsheet/PDF for remote workers?",
          publishedAt: new Date(now - 4 * DAY_MS),
          engagement: { upvotes: 98, comments: 31 },
          intent: "very_strong",
        },
        {
          id: "s15",
          sourceType: "youtube",
          title: "Quarterly estimated tax calculation formula",
          content: "Video was great, but where can I download the exact calculation worksheet?",
          publishedAt: new Date(now - 15 * DAY_MS),
          engagement: { upvotes: 72, comments: 14 },
          intent: "very_strong",
        },
        {
          id: "s16",
          sourceType: "reddit",
          title: "LLC vs S-Corp election decision flowchart",
          content: "Need a clear decision tree of when the S-Corp payroll threshold makes financial sense.",
          publishedAt: new Date(now - 80 * DAY_MS),
          engagement: { upvotes: 180, comments: 45 },
          intent: "strong",
        },
      ],
    },
    {
      id: "m-3d-print",
      name: "3D Printer First Layer & Bed Leveling Calibration",
      category: "lifestyle",
      competitorCount: 3,
      signals: [
        {
          id: "s17",
          sourceType: "reddit",
          title: "PETG stringing and z-offset calibration flowchart",
          content: "Need a troubleshooting guide for first layer rippling. Every forum gives contradictory advice.",
          publishedAt: new Date(now - 3 * DAY_MS),
          engagement: { upvotes: 55, comments: 19 },
          intent: "strong",
        },
        {
          id: "s18",
          sourceType: "youtube",
          title: "Klipper pressure advance tuning",
          content: "Can someone share a cheat sheet with macro commands and test line formulas?",
          publishedAt: new Date(now - 14 * DAY_MS),
          engagement: { upvotes: 40, comments: 7 },
          intent: "medium",
        },
      ],
    },
    {
      id: "m-notion-freelance",
      name: "Client Onboarding & Project Scope Tracker",
      category: "productivity",
      competitorCount: 5,
      signals: [
        {
          id: "s19",
          sourceType: "reddit",
          title: "Freelance client portal template",
          content: "Looking for an organized client intake checklist and scope sign-off sheet.",
          publishedAt: new Date(now - 5 * DAY_MS),
          engagement: { upvotes: 82, comments: 15 },
          intent: "very_strong",
        },
        {
          id: "s20",
          sourceType: "youtube",
          title: "Preventing scope creep in web development",
          content: "Wish the creator linked a PDF contract addendum checklist for change requests.",
          publishedAt: new Date(now - 25 * DAY_MS),
          engagement: { upvotes: 64, comments: 11 },
          intent: "strong",
        },
      ],
    },
  ];
}
