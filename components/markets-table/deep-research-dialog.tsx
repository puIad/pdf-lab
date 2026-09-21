// components/markets-table/deep-research-dialog.tsx — Deep research launcher dialog per PRD §40.

"use client";

import React, { useState } from "react";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface DeepResearchDialogProps {
  onSuccess?: () => void;
  triggerButton?: React.ReactNode;
}

export function DeepResearchDialog({
  onSuccess,
  triggerButton,
}: DeepResearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [nicheQuery, setNicheQuery] = useState("");
  const [mode, setMode] = useState<"deep" | "explore" | "validate" | "hunt">("deep");
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleLaunchRun(e: React.FormEvent) {
    e.preventDefault();
    if (!nicheQuery.trim() || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage("Collecting real signals & running AI extraction...");

    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: nicheQuery.trim(),
          mode,
          limit: 25,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to execute research run");
      }

      setStatusMessage("Research run completed! Refreshing market explorer...");
      setTimeout(() => {
        setIsLoading(false);
        setOpen(false);
        setNicheQuery("");
        setStatusMessage(null);
        if (onSuccess) {
          onSuccess();
        } else {
          window.location.reload();
        }
      }, 800);
    } catch (err) {
      setIsLoading(false);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatusMessage(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          triggerButton ? (
            React.isValidElement(triggerButton) ? (
              triggerButton
            ) : (
              <button type="button">{triggerButton}</button>
            )
          ) : (
            <Button className="font-medium gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs cursor-pointer">
              <Sparkles className="size-4" />
              <span>Run Deep Research</span>
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleLaunchRun}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <span>Launch Deep Market Research</span>
            </DialogTitle>
            <DialogDescription>
              Execute a zero-hallucination, 10-state research pipeline. Ingests real market signals, extracts pain points, clusters problem areas, and synthesizes 25 distinct opportunities.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="niche-input" className="text-xs font-semibold text-foreground">
                Target Niche or Audience Query
              </label>
              <Input
                id="niche-input"
                placeholder="e.g. pc troubleshooting, notion for accountants..."
                value={nicheQuery}
                onChange={(e) => setNicheQuery(e.target.value)}
                disabled={isLoading}
                required
                className="w-full text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Enter a specific problem area, software, audience, or hobby.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Research Depth & Mode (PRD §27)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "deep", label: "Deep Research", desc: "Full 10-state pipeline" },
                  { id: "explore", label: "Explore", desc: "Rapid broad scan" },
                  { id: "validate", label: "Validate", desc: "Investigate exact concept" },
                  { id: "hunt", label: "Hunt", desc: "Target underserved gaps" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMode(item.id as typeof mode)}
                    disabled={isLoading}
                    className={`flex flex-col text-left p-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                      mode === item.id
                        ? "border-primary bg-primary/5 text-foreground font-medium"
                        : "border-border hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <span className="font-semibold">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] text-muted-foreground">Live Sources:</span>
              <Badge variant="outline" className="text-[10px] py-0">Reddit</Badge>
              <Badge variant="outline" className="text-[10px] py-0">Google Trends</Badge>
              <Badge variant="outline" className="text-[10px] py-0">Web Search</Badge>
              <Badge variant="outline" className="text-[10px] py-0">Marketplaces</Badge>
            </div>

            {statusMessage && (
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted/60 border border-border text-xs text-foreground animate-pulse">
                <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="ghost" disabled={isLoading} />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={!nicheQuery.trim() || isLoading}
              className="gap-1.5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Researching...</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  <span>Start Pipeline</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
