// app/briefs/opportunity/[id]/page.tsx — build-ready brief from a Deep-run opportunity (Part 3.10).

import { notFound } from "next/navigation";
import { BriefPage } from "@/components/brief/brief-page";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OpportunityBriefPage(props: PageProps<"/briefs/opportunity/[id]">) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();
  return <BriefPage source={{ kind: "opportunity", id }} back={{ href: `/opportunities/${id}`, label: "Opportunity" }} />;
}
