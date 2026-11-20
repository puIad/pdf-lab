// components/alerts/alert-controls.tsx: mute and threshold of one watch, and "mark all read" (Part 4.3).

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WatchAlertSettings({ watchId, initialThreshold, initialMuted, defaultThreshold, unit }: { watchId: string; initialThreshold: number | null; initialMuted: boolean; defaultThreshold: number; unit: string }) {
  const router = useRouter();
  const [muted, setMuted] = useState(initialMuted);
  const [threshold, setThreshold] = useState(String(initialThreshold ?? defaultThreshold));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save(body: { muted?: boolean; threshold?: number | null }) {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/alerts/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watchId, ...body }) });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      if (body.muted !== undefined) setMuted(body.muted);
      router.refresh();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Alert at
        <Input
          type="number"
          min={1}
          max={100}
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          onBlur={() => {
            const n = Number(threshold);
            if (Number.isInteger(n) && n >= 1 && n <= 100) void save({ threshold: n });
            else setProblem("Use a whole number from 1 to 100.");
          }}
          className="h-7 w-16"
          aria-label={`Alert threshold, ${unit}`}
        />
        {unit}
      </label>
      <Button size="xs" variant={muted ? "default" : "outline"} disabled={busy} aria-pressed={muted} onClick={() => save({ muted: !muted })}>
        {muted ? "Unmute" : "Mute"}
      </Button>
      {problem ? (
        <span className="basis-full text-xs text-destructive" role="alert">
          {problem}
        </span>
      ) : null}
    </div>
  );
}

export function MarkAllRead({ unread }: { unread: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={busy || unread === 0}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/alerts", { method: "POST" });
        setBusy(false);
        router.refresh();
      }}
    >
      Mark all read
    </Button>
  );
}
