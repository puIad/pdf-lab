// components/markets-table/deep-research-dialog.tsx — "Deep research" entry button.
// Deep runs are analysed by a pasted model reply (Part 6.15, DEC-015), which needs a page of its
// own. This used to be a dialog posting to /api/runs; it had no API key and always got 401.

import React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeepResearchDialog() {
  return (
    <Link href="/deep">
      <Button size="sm" className="gap-1.5 cursor-pointer">
        <Sparkles className="size-4" />
        <span>Deep research</span>
      </Button>
    </Link>
  );
}
