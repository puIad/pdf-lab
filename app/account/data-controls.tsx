"use client";

// app/account/data-controls.tsx — export your data, or delete the account (Phase 6 Part 6.3).

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DELETE_CONFIRMATION } from "@/lib/privacy/account-data";

export function DataControls() {
  const router = useRouter();
  const [phrase, setPhrase] = useState("");
  const [state, setState] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
  const ready = phrase.trim().toLowerCase() === DELETE_CONFIRMATION;

  async function remove() {
    setState({ busy: true, message: null });
    try {
      const res = await fetch("/api/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: phrase }) });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      router.push("/");
      router.refresh();
    } catch (err) {
      setState({ busy: false, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your data</CardTitle>
        <CardDescription>Download what PDF Lab stores about you, or delete your account and every row tied to it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <a href="/api/account" download>
          <Button variant="outline" size="sm" type="button">Download my data (JSON)</Button>
        </a>
        <div className="space-y-2 border-t border-border pt-4">
          <label htmlFor="delete-confirm" className="text-sm font-medium">
            Type &quot;{DELETE_CONFIRMATION}&quot; to delete your account. This cannot be undone.
          </label>
          <Input id="delete-confirm" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
          <Button variant="destructive" size="sm" type="button" disabled={!ready || state.busy} onClick={remove}>
            {state.busy ? "Deleting" : "Delete my account"}
          </Button>
          {state.message && (
            <p className="text-sm text-destructive" role="alert">
              {state.message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
