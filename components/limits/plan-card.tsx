// components/limits/plan-card.tsx: the upgrade prompt on /account (Part 5.3). It shows what premium
// changes, with the measured cost basis line, and a stub button that flips the plan. Nothing is charged.

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface PlanRow {
  label: string;
  free: string;
  premium: string;
}

export function PlanCard({ plan, rows, costLine, stubOpen, atLimit }: { plan: "free" | "premium"; rows: PlanRow[]; costLine: string; stubOpen: boolean; atLimit: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const target = plan === "free" ? "premium" : "free";

  async function change() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/billing/stub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: target }) });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) setProblem(body?.error ?? `Request failed (${res.status})`);
      else router.refresh();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan === "free" ? "Upgrade to premium" : "You are on premium"}</CardTitle>
        <CardDescription>
          {atLimit.length > 0 ? `You have reached the free limit for ${atLimit.join(", ")}. ` : ""}
          {costLine}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 font-medium">Limit</th>
              <th className="py-1 font-medium">Free</th>
              <th className="py-1 font-medium">Premium</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="py-1.5 capitalize">{r.label}</td>
                <td className="py-1.5 font-mono tabular-nums">{r.free}</td>
                <td className="py-1.5 font-mono tabular-nums">{r.premium}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {stubOpen ? (
          <div className="space-y-2">
            <Button type="button" size="sm" variant={plan === "free" ? "default" : "outline"} disabled={busy} onClick={change}>
              {plan === "free" ? "Switch to premium (test mode)" : "Switch back to free (test mode)"}
            </Button>
            <p className="text-xs text-muted-foreground">Test mode: no payment is taken and no card is asked for. A payment provider is not connected yet.</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Premium is not open for sign-up yet.</p>
        )}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
