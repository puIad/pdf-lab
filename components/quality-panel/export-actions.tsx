"use client";

import React, { useState } from "react";
import { FileText, Table, FileCode, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportActionsProps {
  marketId: string;
  className?: string;
}

export function ExportActions({ marketId, className = "" }: ExportActionsProps) {
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [downloadedFormat, setDownloadedFormat] = useState<string | null>(null);

  const handleDownload = async (format: "markdown" | "csv" | "json") => {
    try {
      setDownloadingFormat(format);
      const url = `/api/export?market_id=${encodeURIComponent(marketId)}&format=${format}&download=true`;

      // Trigger browser download via hidden link
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadedFormat(format);
      setTimeout(() => setDownloadedFormat(null), 2500);
    } catch (e) {
      console.error("Failed to download export:", e);
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <Button
        variant="outline"
        size="sm"
        disabled={downloadingFormat !== null}
        onClick={() => handleDownload("markdown")}
        className="h-9 gap-1.5 text-xs font-medium"
      >
        {downloadingFormat === "markdown" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : downloadedFormat === "markdown" ? (
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <FileText className="h-3.5 w-3.5 text-primary" />
        )}
        Markdown (.md)
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={downloadingFormat !== null}
        onClick={() => handleDownload("csv")}
        className="h-9 gap-1.5 text-xs font-medium"
      >
        {downloadingFormat === "csv" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : downloadedFormat === "csv" ? (
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Table className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        )}
        CSV Spreadsheet (.csv)
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={downloadingFormat !== null}
        onClick={() => handleDownload("json")}
        className="h-9 gap-1.5 text-xs font-medium"
      >
        {downloadingFormat === "json" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : downloadedFormat === "json" ? (
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <FileCode className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        )}
        Structured JSON (.json)
      </Button>
    </div>
  );
}
