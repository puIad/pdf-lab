// scripts/takedown.ts — block a URL and delete what is stored for it (issue #76).
// Usage: node --env-file=.env.local scripts/takedown.ts <url> [reason]
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "@supabase/supabase-js";
import { addTakedown } from "../lib/takedown/takedown.ts";

const [url, ...reason] = process.argv.slice(2);
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !apiUrl || !key) {
  console.error("usage: node --env-file=.env.local scripts/takedown.ts <url> [reason]  (needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}
const result = await addTakedown(createClient(apiUrl, key, { auth: { persistSession: false } }), url, reason.join(" ") || undefined);
console.log(JSON.stringify(result));
