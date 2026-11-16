// components/watchlist/watch-toggle.tsx — saves or removes one market, seed or idea on the
// signed-in person's watchlist (Phase 4 Part 4.1). Signed out, the server answers 401 and the
// button shows a sign-in link back to this page. Put it in a flex-wrap row: a message takes its
// own line under the buttons.

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WatchKind } from "@/lib/watchlist/watchlist";

interface Props {
  watch: { kind: WatchKind; ref: string; region?: string; seed?: string };
  initialWatched: boolean;
  /** Button text when saved and when not. */
  on: string;
  off: string;
  size?: "xs" | "sm";
  /** Tells the parent after a save or a removal succeeded. */
  onChange?: (watched: boolean) => void;
  /** On the watchlist page itself: reload the list so a removed row leaves it. */
  refreshOnChange?: boolean;
}

export function WatchToggle({ watch, initialWatched, on, off, size = "sm", onChange, refreshOnChange = false }: Props) {
  const router = useRouter();
  const [watched, setWatched] = useState(initialWatched);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; signIn: string | null } | null>(null);

  async function toggle() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: watched ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(watch),
      });
      const body = (await res.json().catch(() => null)) as { watched?: boolean; error?: string } | null;
      if (!res.ok || typeof body?.watched !== "boolean") {
        const here = `${window.location.pathname}${window.location.search}`;
        setProblem({ text: body?.error ?? `Request failed (${res.status})`, signIn: res.status === 401 ? `/login?next=${encodeURIComponent(here)}` : null });
      } else {
        setWatched(body.watched);
        onChange?.(body.watched);
        if (refreshOnChange) router.refresh();
      }
    } catch (err) {
      setProblem({ text: err instanceof Error ? err.message : "Request failed", signIn: null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={watched && !refreshOnChange ? "secondary" : "outline"}
        className="cursor-pointer"
        disabled={busy}
        // A two-state button where it saves; a plain action on the list, where it only removes.
        aria-pressed={refreshOnChange ? undefined : watched}
        title={watched ? "Remove from your watchlist" : "Save to your watchlist"}
        onClick={toggle}
      >
        {busy ? <Loader2 className="animate-spin" /> : watched ? <BookmarkCheck /> : <Bookmark />}
        {watched ? on : off}
      </Button>
      {problem && (
        // Being signed out is not a failure: only a real error is shown in red.
        <p role="status" className={`basis-full text-[11px] ${problem.signIn ? "text-muted-foreground" : "text-rose-600 dark:text-rose-400"}`}>
          {problem.text}{" "}
          {problem.signIn && (
            <Link href={problem.signIn} className="font-medium text-foreground underline underline-offset-2">
              Sign in
            </Link>
          )}
        </p>
      )}
    </>
  );
}
