"use client";

// app/settings/settings-view.tsx — candidate list with a Test button per model. A model that did not
// answer cannot be selected; the server tests again before it saves.

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExtractionMode, ModelCandidate, ModelTestResult } from "@/lib/ai/extraction-mode";

const keyOf = (c: { provider: string; model: string }) => `${c.provider}/${c.model}`;

export function SettingsView(props: { initialMode: ExtractionMode | null; loadError: string | null; candidates: ModelCandidate[] }) {
  const [mode, setMode] = useState<ExtractionMode | null>(props.initialMode);
  const [tests, setTests] = useState<Record<string, ModelTestResult | "running">>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isSaved = (c: ModelCandidate) => mode?.kind === "model" && mode.provider === c.provider && mode.model === c.model;

  async function runTest(c: ModelCandidate) {
    setTests((t) => ({ ...t, [keyOf(c)]: "running" }));
    try {
      const res = await fetch("/api/settings/extraction/test", { method: "POST", body: JSON.stringify({ provider: c.provider, model: c.model }) });
      const body = (await res.json()) as { test?: ModelTestResult; error?: string };
      setTests((t) => ({ ...t, [keyOf(c)]: body.test ?? { answered: false, ms: 0, error: body.error ?? `HTTP ${res.status}` } }));
    } catch (err) {
      setTests((t) => ({ ...t, [keyOf(c)]: { answered: false, ms: 0, error: err instanceof Error ? err.message : String(err) } }));
    }
  }

  async function save(next: ExtractionMode, id: string) {
    setSaving(id);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/extraction", { method: "POST", body: JSON.stringify({ mode: next }) });
      const body = (await res.json()) as { error?: string };
      if (res.ok) {
        setMode(next);
        setMessage("Saved.");
      } else setMessage(body.error ?? `HTTP ${res.status}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      {props.loadError && (
        <p className="text-sm text-destructive" role="alert">
          {props.loadError}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Extraction mode</CardTitle>
          <CardDescription>
            Who reads each signal in a Deep run. Test a model first: only one that answered can be saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y divide-border">
            {props.candidates.map((c) => {
              const t = tests[keyOf(c)];
              const passed = typeof t === "object" && t.answered;
              return (
                <li key={keyOf(c)} className="space-y-2 py-3 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all font-mono text-sm">{c.model}</span>
                    <Badge variant="outline">{c.provider}</Badge>
                    {c.paid && <Badge variant="outline">may cost money</Badge>}
                    {isSaved(c) && <Badge>In use</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{c.note}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" disabled={t === "running"} onClick={() => runTest(c)}>
                      {t === "running" ? "Testing…" : "Test"}
                    </Button>
                    <Button
                      size="sm"
                      disabled={!passed || saving !== null || isSaved(c)}
                      onClick={() => save({ kind: "model", provider: c.provider, model: c.model }, keyOf(c))}
                    >
                      {saving === keyOf(c) ? "Saving…" : "Use this model"}
                    </Button>
                    {t && t !== "running" && (
                      <span className={`text-xs ${t.answered ? "text-foreground" : "text-destructive"}`} role="status">
                        {t.answered ? `Answered in ${(t.ms / 1000).toFixed(1)} s` : `Not answering${t.error ? `: ${t.error}` : ""}`}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
            {props.candidates.length === 0 && <li className="py-3 text-sm text-muted-foreground">No chat provider is configured.</li>}
          </ul>
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Pasted replies</span>
              {mode?.kind === "pasted" && <Badge>In use</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">No model is called. Deep research sends you to the paste flow.</p>
            <Button size="sm" variant="outline" disabled={saving !== null || mode?.kind === "pasted"} onClick={() => save({ kind: "pasted" }, "pasted")}>
              Use pasted replies
            </Button>
          </div>
          {message && (
            <p className="text-sm" role="status">
              {message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
