// app/briefs/idea/page.tsx — build-ready brief from a validated quick idea (Part 3.10).
// /briefs/idea?seed=<seed>&phrase=<phrase>. Validate runs on the phrase while the page loads; KILL gets no brief.

import { notFound } from "next/navigation";
import { BriefPage } from "@/components/brief/brief-page";

export const dynamic = "force-dynamic";

export default async function IdeaBriefPage(props: PageProps<"/briefs/idea">) {
  const q = await props.searchParams;
  const seed = typeof q.seed === "string" ? q.seed.trim() : "";
  const phrase = typeof q.phrase === "string" ? q.phrase.trim() : "";
  if (seed.length < 2 || seed.length > 100 || phrase.length < 2 || phrase.length > 160) notFound();
  return <BriefPage source={{ kind: "idea", seed, phrase }} back={{ href: `/ideas?q=${encodeURIComponent(seed)}`, label: `Ideas for “${seed}”` }} />;
}
