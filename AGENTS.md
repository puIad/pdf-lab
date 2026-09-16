# PDF LAB — agent entrypoint

This is the PDF Lab project. `docs/` is the single source of truth; the PRD vision
(`../pdf-lab.md`, if present) defers to `docs/` on implementation detail.

Every task, in this order:
1. Read `docs/00-START-HERE.md` (load order + short-prompt contract).
2. Read `docs/01-PHILOSOPHY.md` (session protocol).
3. Read `docs/STATE.md` (what is done / next / blocked).
4. Read `docs/02-MASTER-PLAN.md` (where the part sits in the DAG).
5. Read the requested phase file in `docs/phases/`, then follow its links.
6. Do the work, update `docs/STATE.md` same turn, run `docs/REVIEW-CHECKLIST.md`.

Rules: evidence before synthesis; adapters own source code; problems halt into
`docs/DECISIONS.md`; one part = one commit (`phase-<N>-part-<M>: <summary>`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
