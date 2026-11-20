// components/metrics/useful-vote.tsx — "Was this useful?" on an opportunity (Phase 6 Part 6.2).
// Signed out, the server answers 401 and the line shows a sign-in link back to this page.

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UsefulVote({ opportunityId }: { opportunityId: string }) {
  const [choice, setChoice] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; signIn: boolean } | null>(null);

  async function vote(useful: boolean) {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/metrics/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId, useful }),
      });
      const body = (await res.json().catch(() => null)) as { voted?: boolean; error?: string } | null;
      if (!res.ok || !body?.voted) setProblem({ text: body?.error ?? `Request failed (${res.status})`, signIn: res.status === 401 });
      else setChoice(useful);
    } catch (err) {
      setProblem({ text: err instanceof Error ? err.message : "Request failed", signIn: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Was this opportunity useful?</span>
      <Button type="button" size="xs" variant={choice === true ? "secondary" : "outline"} aria-pressed={choice === true} disabled={busy} onClick={() => vote(true)}>
        <ThumbsUp /> Useful
      </Button>
      <Button type="button" size="xs" variant={choice === false ? "secondary" : "outline"} aria-pressed={choice === false} disabled={busy} onClick={() => vote(false)}>
        <ThumbsDown /> Not useful
      </Button>
      {problem && (
        <span role="status" className={problem.signIn ? "" : "text-rose-600 dark:text-rose-400"}>
          {problem.text}{" "}
          {problem.signIn && (
            <Link href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname)}`} className="font-medium text-foreground underline underline-offset-2">
              Sign in
            </Link>
          )}
        </span>
      )}
    </div>
  );
}
