// components/alerts/alert-controls.tsx: mute and threshold of one watch, and "mark all read" (Part 4.3).

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function send(url: string, init: RequestInit): Promise<void> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Could not save.");
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function WatchAlertSettings({ watchId, initialThreshold, initialMuted, defaultThreshold, unit }: { watchId: string; initialThreshold: number | null; initialMuted: boolean; defaultThreshold: number; unit: string }) {
  const router = useRouter();
  const [muted, setMuted] = useState(initialMuted);
  const [threshold, setThreshold] = useState(String(initialThreshold ?? defaultThreshold));
  const [savedThreshold, setSavedThreshold] = useState(initialThreshold ?? defaultThreshold);
  const [problem, setProblem] = useState<string | null>(null);

  // The server upserts only the fields sent, so a threshold save and a Mute click can run at once.
  async function save(body: { muted?: boolean; threshold?: number }) {
    setProblem(null);
    try {
      await send("/api/alerts/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watchId, ...body }) });
      if (body.muted !== undefined) setMuted(body.muted);
      if (body.threshold !== undefined) setSavedThreshold(body.threshold);
      router.refresh();
    } catch (err) {
      setProblem(message(err));
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
            if (!Number.isInteger(n) || n < 1 || n > 100) setProblem("Use a whole number from 1 to 100.");
            else if (n !== savedThreshold) void save({ threshold: n });
          }}
          className="h-7 w-16"
          aria-label={`Alert threshold, ${unit}`}
        />
        {unit}
      </label>
      <Button size="xs" variant={muted ? "default" : "outline"} aria-pressed={muted} onClick={() => save({ muted: !muted })}>
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
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="xs"
        variant="outline"
        disabled={busy || unread === 0}
        onClick={async () => {
          setBusy(true);
          setProblem(null);
          try {
            await send("/api/alerts", { method: "POST" });
            router.refresh();
          } catch (err) {
            setProblem(message(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        Mark all read
      </Button>
      {problem ? (
        <span className="text-xs text-destructive" role="alert">
          {problem}
        </span>
      ) : null}
    </span>
  );
}
