"use client";

// components/evidence/evidence-dialog.tsx — Interactive evidence citation inspection modal.
// Triggered by clicking any metric, confidence pill, or claim.

import React, { useState } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Layers } from "lucide-react";
import { EvidenceList } from "./evidence-list";
import type { EvidenceRow } from "@/lib/evidence/types";

export interface EvidenceDialogProps {
  title: string;
  subtitle?: string;
  triggerText?: string;
  triggerNode?: React.ReactNode;
  items: EvidenceRow[];
}

export function EvidenceDialog({
  title,
  subtitle,
  triggerText,
  triggerNode,
  items,
}: EvidenceDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        triggerNode ? (
          <div>{triggerNode}</div>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <ShieldCheck className="size-3.5 text-primary" />
            <span>{triggerText || `Citations (${items.length})`}</span>
          </Button>
        )
      } />

      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="gap-1 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          </div>
          {subtitle && (
            <DialogDescription className="text-xs text-muted-foreground">
              {subtitle}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="py-2">
          <EvidenceList items={items} emptyMessage="No raw evidence records linked to this claim." />
        </div>
      </DialogContent>
    </Dialog>
  );
}
