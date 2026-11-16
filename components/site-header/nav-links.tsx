// components/site-header/nav-links.tsx — the header's section links, with the current one marked
// (Part 6.12). Client-only because the active section follows the URL.

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface Section {
  href: string;
  label: string;
  /** Path prefixes that belong to this section. */
  match: string[];
}

const SECTIONS: Section[] = [
  { href: "/", label: "Ideas", match: ["/ideas", "/briefs/idea"] },
  { href: "/markets", label: "Markets", match: ["/markets", "/opportunities", "/search", "/briefs/opportunity"] },
  { href: "/research", label: "Research", match: ["/research", "/deep"] },
  { href: "/radar", label: "Radar", match: ["/radar"] },
];

function isActive(section: Section, pathname: string): boolean {
  if (section.href === "/" && pathname === "/") return true;
  return section.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function NavLinks() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="flex min-w-0 items-center gap-0.5 sm:gap-1">
      {SECTIONS.map((s) => {
        const active = isActive(s, pathname);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-md px-2 py-1.5 text-sm transition-colors sm:px-3",
              active ? "font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {s.label}
            {active && <span aria-hidden className="absolute inset-x-2 -bottom-[11px] h-0.5 rounded-full bg-foreground sm:inset-x-3" />}
          </Link>
        );
      })}
    </nav>
  );
}
