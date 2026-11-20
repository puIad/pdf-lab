// app/account/page.tsx — who is signed in, their plan, and what is left of each limit
// (Phase 5 Part 5.1). Every number is a count of usage_events rows in the current window.

import React from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataControls } from "./data-controls";
import { resolveCaller, usageStore } from "@/lib/quotas/guard";
import { KIND_LABEL, quotaState, USAGE_KINDS, windowStart, LIMITS, type QuotaState } from "@/lib/quotas/quotas";

export const dynamic = "force-dynamic";

export const metadata = { title: "Account — PDF LAB", description: "Your PDF Lab plan and what is left of each limit." };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function AccountPage() {
  const caller = await resolveCaller(await headers());
  const counted = caller.plan === "anon" || caller.plan === "free" || caller.plan === "premium";

  let quotas: QuotaState[] = [];
  let loadError: string | null = null;
  if (counted) {
    const plan = caller.plan as "anon" | "free" | "premium";
    const store = usageStore();
    const now = new Date();
    try {
      quotas = await Promise.all(
        USAGE_KINDS.map(async (kind) => quotaState(plan, kind, await store.count(caller, kind, windowStart(LIMITS[plan][kind].window, now)), now)),
      );
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <main className="flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex items-center gap-3 border-b border-border pb-5">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              Home
            </Button>
          </Link>
          <div className="hidden h-4 w-px bg-border sm:block" />
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Account</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <span className="break-all">{caller.email ?? (caller.plan === "local" ? "Local dev server, signed out" : "Signed out")}</span>
              <Badge variant={caller.plan === "premium" ? "default" : "outline"} className="uppercase tracking-wide">
                {caller.plan === "anon" ? "no plan" : caller.plan}
              </Badge>
            </CardTitle>
            <CardDescription>
              {caller.plan === "local"
                ? "Nothing is counted while you are signed out on a dev server. Sign in to see a plan's limits."
                : caller.plan === "anon"
                  ? "Signed out, you can search a few times a day. Sign in for idea scans, competition checks and Deep runs."
                  : "Limits reset at midnight UTC: daily ones every day, monthly ones on the 1st."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {caller.userId ? (
              <form action="/auth/signout" method="post">
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            ) : (
              <Link href="/login">
                <Button size="sm">Sign in</Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {loadError && (
          <p className="text-sm text-destructive" role="alert">
            Could not read your usage: {loadError}
          </p>
        )}

        {quotas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {quotas.map((q) => (
                  <li key={q.kind} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm font-medium capitalize">{KIND_LABEL[q.kind]}</span>
                      <span className="font-mono text-sm tabular-nums">
                        {q.limit === 0 ? "sign in" : `${q.used} of ${q.limit} used`}
                      </span>
                    </div>
                    {q.limit > 0 && (
                      <>
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-label={`${KIND_LABEL[q.kind]} used`}
                          aria-valuemin={0}
                          aria-valuemax={q.limit}
                          aria-valuenow={Math.min(q.used, q.limit)}
                        >
                          <div
                            className={`h-full rounded-full ${q.remaining === 0 ? "bg-destructive" : "bg-foreground"}`}
                            style={{ width: `${Math.min(100, (q.used / q.limit) * 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {q.remaining} left this {q.window}. Resets {day(q.resetsAt)}.
                        </p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {caller.userId && <DataControls />}
      </div>
    </main>
  );
}
