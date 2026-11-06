// lib/export/brief.ts — brief exports (Phase 3 Part 3.10): Markdown, like the 2.4 report export, and
// DOCX via `docx` (9.13.0, API checked on Context7 /dolanmiu/docx 2026-11-06). Both render the
// same block list (lib/brief/blocks.ts).

import { Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { briefBlocks, type Block } from "../brief/blocks.ts";
import type { Brief } from "../brief/types.ts";

function mdLinks(b: Block): string {
  if (!b.links.length) return "";
  return ` (Sources: ${b.links.map((l) => (l.url ? `[${l.label}](${l.url})` : l.label)).join(", ")})`;
}

export function generateBriefMarkdown(brief: Brief): string {
  const lines: string[] = [];
  let prev: Block["kind"] | null = null;
  for (const b of briefBlocks(brief)) {
    const t = b.text + mdLinks(b);
    if (prev === "bullet" && b.kind !== "bullet") lines.push(""); // end the list before the next block
    prev = b.kind;
    switch (b.kind) {
      case "h1":
        lines.push(`# ${t}`, "");
        break;
      case "h2":
        lines.push(`## ${t}`, "");
        break;
      case "h3":
        lines.push(`### ${t}`, "");
        break;
      case "bullet":
        lines.push(`- ${t}`);
        break;
      case "quote":
      case "note":
        lines.push(`> ${t}`, "");
        break;
      default:
        lines.push(t, "");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

const HEADING = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3 } as const;

function paragraph(b: Block): Paragraph {
  const children: (TextRun | ExternalHyperlink)[] = [new TextRun({ text: b.text, italics: b.kind === "quote" || b.kind === "note" })];
  if (b.links.length) {
    children.push(new TextRun({ text: " (Sources: " }));
    b.links.forEach((l, i) => {
      if (i) children.push(new TextRun({ text: ", " }));
      children.push(
        l.url
          ? new ExternalHyperlink({ link: l.url, children: [new TextRun({ text: l.label, style: "Hyperlink" })] })
          : new TextRun({ text: l.label }),
      );
    });
    children.push(new TextRun({ text: ")" }));
  }
  return new Paragraph({
    children,
    ...(b.kind === "h1" || b.kind === "h2" || b.kind === "h3" ? { heading: HEADING[b.kind] } : {}),
    ...(b.kind === "bullet" ? { bullet: { level: 0 } } : {}),
    ...(b.kind === "quote" || b.kind === "note" ? { indent: { left: 360 } } : {}),
  });
}

export async function generateBriefDocx(brief: Brief): Promise<Buffer> {
  const doc = new Document({
    creator: "PDF Lab",
    title: brief.title,
    sections: [{ children: briefBlocks(brief).map(paragraph) }],
  });
  return Packer.toBuffer(doc);
}
