# PDF LAB — agent entrypoint

This is the PDF Lab project. The plan is in GitHub issues (`gh issue list`); `docs/` holds the
rules, the specs and the decisions. The PRD vision (`../pdf-lab.md`, if present) defers to `docs/`
on implementation detail.

Every task, in this order:
1. Read `docs/README.md` (how work happens, the rules, the review checklist, the file map).
2. Read the issue being worked on (`gh issue view <n>`), then the specs in `docs/` it touches.
3. Do the work and verify it for real. One issue = one commit: `phase-<N>-part-<M>: <summary>` for
   a `part` issue, `fix: <summary>` for a `defect`. The pull request body says `Fixes #<n>`.
4. Run the review checklist in `docs/README.md`. A fault found on the way becomes a new `defect`
   issue.

Rules: evidence before synthesis; adapters own source code; problems halt into
`docs/DECISIONS.md` (triggers and procedure in `docs/README.md`).
Frontend rule: build all frontend, UI design, styling, and page components in this project
from the UI primitives in `components/ui` (DEC-016). Add a primitive there before reaching for
another source.

Docs freshness: `docs/STACK.md` is a plan, not build-time truth. Re-verify via Context7 (resolve
library ID, then query-docs) AND the canonical doc links before installing or using any library.
Next.js additionally via `node_modules/next/dist/docs/`. On mismatch: decision request, never
silently upgrade/downgrade.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
