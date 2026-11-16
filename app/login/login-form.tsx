// app/login/login-form.tsx — email in, one-time sign-in link out (Phase 5 Part 5.1).

"use client";

import React, { useState } from "react";
import { CircleAlert, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserClient } from "@supabase/ssr";

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address || sending) return;
    setSending(true);
    setError(null);
    // lib/db/client.ts also holds the server clients (next/headers), so it cannot load in the browser.
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}` },
    });
    setSending(false);
    if (err) setError(err.message);
    else setSentTo(address);
  }

  if (sentTo) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm" role="status">
        <MailCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">Check {sentTo}</p>
          <p className="text-muted-foreground">
            Open the link in this browser to finish signing in. It works once and expires after an hour.
          </p>
          <button type="button" onClick={() => setSentTo(null)} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Use another address
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <label htmlFor="email" className="block text-xs font-medium text-muted-foreground">
        Email address
      </label>
      <Input
        id="email"
        type="email"
        required
        autoComplete="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="h-10"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "login-error" : undefined}
      />
      {error && (
        <p id="login-error" className="flex items-start gap-1.5 text-xs text-destructive" role="alert">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-10 w-full" disabled={sending || !email.trim()}>
        {sending ? (
          <>
            <Loader2 className="animate-spin" />
            Sending
          </>
        ) : (
          "Email me a sign-in link"
        )}
      </Button>
    </form>
  );
}
