// app/login/page.tsx — sign in with an emailed link, no password (Phase 5 Part 5.1).

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KIND_LABEL, LIMITS, USAGE_KINDS } from "@/lib/quotas/quotas";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in — PDF LAB",
  description: "Sign in to PDF Lab with a one-time link sent to your email.",
};

export default async function LoginPage(props: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await props.searchParams;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-md space-y-6 px-4 py-10 sm:px-6">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            Home
          </Button>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-bold tracking-tight">Sign in to PDF Lab</CardTitle>
            <CardDescription>No password. We email you a link, you open it, you are in.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm next={next && /^\/(?![/\\])/.test(next) ? next : "/account"} initialError={error ?? null} />
          </CardContent>
        </Card>
        <div className="space-y-2 px-1 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">What the free plan includes</p>
          <ul className="space-y-1">
            {USAGE_KINDS.map((kind) => (
              <li key={kind} className="flex justify-between gap-4 border-b border-border/60 pb-1">
                <span className="capitalize">{KIND_LABEL[kind]}</span>
                <span className="font-mono tabular-nums text-foreground">
                  {LIMITS.free[kind].max} a {LIMITS.free[kind].window}
                </span>
              </li>
            ))}
          </ul>
          <p>Signed out, you get {LIMITS.anon.search.max} searches a day and nothing else.</p>
        </div>
      </div>
    </main>
  );
}
