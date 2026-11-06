// lib/export/brief.ts — brief exports (Phase 3 Part 3.10): Markdown, like the 2.4 report export, and
// DOCX via `docx` (9.13.0, API checked on Context7 /dolanmiu/docx 2026-11-06). Both render the
// same block list (lib/brief/blocks.ts).

import { inflateRawSync } from "node:zlib";
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

function unzipEntry(zip: Buffer, name: string): Buffer | null {
  // End of central directory record: last 22+ bytes, signature 0x06054b50.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const entry = zip.toString("utf8", p + 46, p + 46 + nameLen);
    if (entry === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return method === 0 ? Buffer.from(data) : inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Paragraph texts of a .docx file, in order. Used to prove the export round-trips. */
export function docxParagraphs(file: Buffer): string[] {
  const xml = unzipEntry(file, "word/document.xml")?.toString("utf8");
  if (!xml) throw new Error("not a .docx file: word/document.xml missing");
  return (xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []).map((p) =>
    [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((m) => m[1])
      .join("")
      .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e])
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d))),
  );
}
