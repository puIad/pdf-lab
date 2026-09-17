import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Typed Supabase clients — Phase 0 Part 0.2.
// - Browser: anon key, safe for client components.
// - Server: anon key + cookies, for server components / route handlers.
// - Service: service-role key, SERVER-ONLY. Never import from client
//   components, never prefix the key with NEXT_PUBLIC_.

function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return url;
}

function supabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return key;
}

export function createBrowserSupabaseClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component (read-only cookies) — safe to ignore.
        }
      },
    },
  });
}

export function createServiceSupabaseClient() {
  if (typeof window !== "undefined") {
    throw new Error("Service client must only run on the server");
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createSupabaseClient(supabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
