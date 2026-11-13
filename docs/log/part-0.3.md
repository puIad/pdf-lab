# Part 0.3 — Vercel deploy + CI gate + env docs

Notes moved verbatim from `docs/STATE.md` on 2026-11-13 (Part 6.13).

PROD https://pdf-lab-puiads-projects.vercel.app — /api/health 200 `{"ok":true,"schemaVersion":1,"db":{"configured":true,"sources":3}}`; pdf-lab-ci green on master (run 35198619359 success); preview builds proven (probe PR #1 → READY dpl_FWoqjutLnCCuX6mJi1X8MTurm7bQ, closed unmerged). Project prj_s2iR7ouCA0Xknlsd0fnwFBfXiqJr (nextjs, rootDir Projects/PDF-Lab); 3 Supabase envs set; ssoProtection nulled (prod public, previews SSO). CI fix: typecheck runs `next typegen` first (LayoutProps global needs generated route types; clean checkouts failed TS2304). 2 commits not 1 (build-then-fix; history truthful). FOLLOW-UP: connect repo in dashboard Git settings for auto-deploys (`link:null`). Spillover: `Projects/PDF-Lab/AGENTS.md` shows an uncommitted Docs-freshness block NOT authored this part — left untouched
