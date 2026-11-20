// app/settings/page.tsx — the extraction mode (Part 6.9, DEC-015): a tested chat model, or pasted replies.

import React from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { getRouter } from "@/lib/ai/index";
import { candidateModels, type ExtractionMode } from "@/lib/ai/extraction-mode";
import { loadExtractionMode } from "@/lib/settings/extraction-mode";
import { resolveCaller } from "@/lib/quotas/guard";
import { canManageSettings } from "@/lib/settings/access";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings — PDF LAB", description: "Choose how Deep research extracts signals: a tested chat model or pasted replies." };

export default async function SettingsPage() {
  const allowed = canManageSettings(await resolveCaller(await headers()));
  let mode: ExtractionMode | null = null;
  let loadError: string | null = null;
  if (allowed) {
    try {
      mode = await loadExtractionMode(createServiceSupabaseClient());
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }
  return (
    <main className="flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex items-center gap-3 border-b border-border pb-5">
          <Link href="/account">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              Account
            </Button>
          </Link>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Settings</h1>
        </div>
        {allowed ? (
          <SettingsView initialMode={mode} loadError={loadError} candidates={candidateModels(getRouter().configuredProviderNames())} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Owner only</CardTitle>
              <CardDescription>These settings change which model the server calls. Sign in as the owner account to edit them.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/login?next=/settings">
                <Button size="sm">Sign in</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
