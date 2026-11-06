// lib/brief/brief.test-helpers.ts — test-only: read paragraph text back out of a .docx so the brief
// tests can prove the DOCX export round-trips. Not imported by app code.

import { inflateRawSync } from "node:zlib";

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
