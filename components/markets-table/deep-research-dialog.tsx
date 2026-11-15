// components/markets-table/deep-research-dialog.tsx — "Deep research" entry button.
// Deep runs are analysed by a pasted model reply (Part 6.15, DEC-015), which needs a page of its
// own. This used to be a dialog posting to /api/runs; it had no API key and always got 401.

import React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeepResearchDialogProps {
  /** Kept for the existing call sites; a finished run is opened from the /deep page. */
  onSuccess?: () => void;
  triggerButton?: React.ReactNode;
}

export function DeepResearchDialog({ triggerButton }: DeepResearchDialogProps) {
  return (
    <Link href="/deep">
      {triggerButton ?? (
        <Button size="sm" className="gap-1.5 cursor-pointer">
          <Sparkles className="size-4" />
          <span>Deep research</span>
        </Button>
      )}
    </Link>
  );
}
