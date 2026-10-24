// components/research/verdict-panel.tsx — Validate verdict GO / WAIT / KILL with each check's count
// and threshold beside it (Phase 3 Part 3.8). Built from the existing ui primitives.

import { Badge } from "@/components/ui/badge";
import type { CheckStatus, ValidationVerdict, Verdict } from "@/lib/planner/verdict";

const VERDICT_TONE: Record<Verdict, string> = {
  GO: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  WAIT: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  KILL: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};
const STATUS: Record<CheckStatus, { mark: string; className: string; label: string }> = {
  pass: { mark: "✓", className: "text-emerald-600 dark:text-emerald-400", label: "pass" },
  weak: { mark: "~", className: "text-amber-600 dark:text-amber-400", label: "weak" },
  fail: { mark: "✗", className: "text-rose-600 dark:text-rose-400", label: "fail" },
  not_observed: { mark: "–", className: "text-muted-foreground", label: "not observed" },
};

export function VerdictPanel({ verdict, compact = false }: { verdict: ValidationVerdict; compact?: boolean }) {
  return (
    <div className={`space-y-2 rounded-lg border p-3 ${VERDICT_TONE[verdict.verdict]}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-lg font-bold tracking-wide">{verdict.verdict}</span>
        <span className="text-xs text-foreground/80">{verdict.reason}</span>
        {!compact && (
          <Badge variant="outline" className="ml-auto text-[10px]" title="Fixed thresholds on stored counts, no LLM (QC Rule 4). Uncalibrated until Part 3.11.">
            rule-based
          </Badge>
        )}
      </div>
      <ul className={`grid gap-1.5 text-xs text-foreground ${compact ? "" : "sm:grid-cols-2"}`}>
        {verdict.checks.map((c) => (
          <li key={c.key} className="flex items-baseline gap-1.5" title={STATUS[c.status].label}>
            <span className={`w-3 shrink-0 text-center font-bold ${STATUS[c.status].className}`} aria-label={STATUS[c.status].label}>
              {STATUS[c.status].mark}
            </span>
            <span>
              <span className="font-medium">{c.label}:</span> {c.count}
              <span className="text-muted-foreground"> (needs {c.threshold})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
