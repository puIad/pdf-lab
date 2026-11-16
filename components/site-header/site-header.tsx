// components/site-header/site-header.tsx — one header for every page (Part 6.12).
// Sections: Ideas (home), Markets, Research, Radar; on the right, Sign in or Account.
// Signed-in state is read from the presence of the Supabase session cookie: it only picks the
// label. The account page and every endpoint check the session for real (Part 5.1).

import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { CircleUserRound, LogIn } from "lucide-react";
import { NavLinks } from "./nav-links";

export async function SiteHeader() {
  // `sb-<ref>-auth-token-code-verifier` is the PKCE secret saved when a sign-in link is requested,
  // before anyone has signed in, so it does not count.
  const signedIn = (await cookies())
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token") && !c.name.endsWith("-code-verifier"));
  return (
    <header className="border-b border-border/80 bg-background">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-4 sm:gap-6 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="PDF Lab home">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">P</span>
          <span className="hidden text-sm font-bold tracking-tight sm:inline">PDF LAB</span>
        </Link>
        <NavLinks />
        <Link
          href={signedIn ? "/account" : "/login"}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={signedIn ? "Account" : "Sign in"}
        >
          {signedIn ? <CircleUserRound className="size-4" /> : <LogIn className="size-4" />}
          <span className="hidden sm:inline">{signedIn ? "Account" : "Sign in"}</span>
        </Link>
      </div>
    </header>
  );
}
