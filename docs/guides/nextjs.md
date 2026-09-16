# GUIDE — Next.js (verified 2026-09-16: v16.3.5, docs lastUpdated 2026-07-21)

Source: https://nextjs.org/docs/app/getting-started/installation (+ `/docs/llms.txt` index).
Re-verify at Phase 0 Part 0.1 if output differs — drift = decision request.

## Requirements

- Node.js ≥ 20.9. macOS / Windows (incl. WSL) / Linux. Modern browsers (Chrome/Edge 111+, FF 111+, Safari 16.4+).
- Turbopack is the DEFAULT bundler (`next dev` / `next build` use it; `--webpack` opts out).

## Scaffold (exact)

```bash
pnpm create next-app@latest pdf-lab --yes
cd pdf-lab
pnpm dev    # http://localhost:3000
```

`--yes` applies recommended defaults: TypeScript, Tailwind CSS, ESLint, App Router,
import alias `@/*`. Prompts (if customizing): TS? linter (ESLint/Biome/None)? React
Compiler? Tailwind? `src/` dir? App Router? alias? AGENTS.md for coding agents?

## Scripts (`package.json`)

```json
{ "scripts": {
  "dev": "next dev", "build": "next build", "start": "next start",
  "lint": "eslint", "lint:fix": "eslint --fix" } }
```

Note: since Next 16, `next build` does NOT run the linter — CI must call it explicitly
(Phase 0 Part 0.3 does).

## Conventions used by PDF LAB

- App Router, file-system routing: `app/layout.tsx` (root, required, `<html>`+`<body>`),
  `app/page.tsx`, `app/api/<route>/route.ts` for server routes (research engine first).
- `@/*` alias (or `./src/*` with `--src-dir`).
- VS Code: custom tab labels for same-named route files (pattern in official installation
  page) — recommended, in `.vscode/settings.json`.
- PDF LAB rule: engine lives in route handlers until proven too heavy; FastAPI worker only
  on evidence of need.
