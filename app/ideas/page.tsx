// app/ideas/page.tsx — Quick ideas moved to the home page in Part 6.12. Old links keep working:
// /ideas?q=…&region=… goes to /?q=…&region=…

import { redirect } from "next/navigation";

export default async function IdeasPage(props: { searchParams: Promise<{ q?: string; region?: string }> }) {
  const { q, region } = await props.searchParams;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (region) params.set("region", region);
  const query = params.toString();
  redirect(query ? `/?${query}` : "/");
}
