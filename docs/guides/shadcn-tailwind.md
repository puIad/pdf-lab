# GUIDE — Tailwind CSS + shadcn/ui (verified 2026-09-16)

Source: https://ui.shadcn.com/docs/installation/next. Re-verify at Phase 0 Part 0.1.

## Prerequisite

Tailwind CSS installed (comes with `create-next-app` recommended defaults) and `@/*`
alias in `tsconfig.json` (`@/*: ["./*"]`, or `./src/*` with `--src-dir`).

## Setup paths (pick ONE)

1. Visual preset: https://ui.shadcn.com/create?template=next → copy generated
   `pnpm dlx shadcn@latest init --preset [CODE] --template next`.
2. CLI scaffold: `pnpm dlx shadcn@latest init -t next` (add `--monorepo` for monorepos).
3. Existing project (ours — Next scaffold already exists):
   `pnpm dlx shadcn@latest init` and follow prompts.

## Add components (exact)

```bash
pnpm dlx shadcn@latest add button card input badge tabs table dialog skeleton
pnpm dlx shadcn@latest add card   # example single add
```

Import from `@/components/ui/*`:

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
```

## PDF LAB component set (minimum)

button, card, input, badge, tabs, table, dialog, skeleton (+ select, tooltip, progress
as needed in Phase 3). Every data surface needs loading (skeleton) + empty + error
states — checklist item in Phase 2/3 parts.

## Mandatory Component & Prompt Source

Per project contract, ALWAYS and ONLY use components, UI primitives, and directing prompts from
`C:\Users\pulad\Desktop\frontend-ai-megalibrary` (primitives, blocks, animated components, and UI design methodologies).
