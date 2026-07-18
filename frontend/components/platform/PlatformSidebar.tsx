"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@lib/utils";
import { PLATFORM_NAV } from "./widgets";

export function isPlatformActive(pathname: string, href: string): boolean {
  return href === "/platform" ? pathname === "/platform" : pathname.startsWith(href);
}

/** Shared grouped nav list — used by the desktop sidebar and the mobile drawer. */
export function PlatformNavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3">
      {PLATFORM_NAV.map((g, gi) => (
        <div key={gi} className={cn(gi > 0 && "mt-5")}>
          {g.title ? (
            <p className="px-2 pb-1.5 font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {g.title}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isPlatformActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                      active && "bg-secondary font-semibold text-foreground"
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active && "text-score-ink")} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function PlatformSidebar() {
  return (
    <aside className="sticky top-0 z-30 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <span className="font-script text-base leading-none text-primary">SDV</span>
        <span className="font-display text-sm font-bold uppercase tracking-wide">
          Platform
        </span>
      </div>
      <PlatformNavList />
      <div className="border-t border-border p-2">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to site
        </Link>
      </div>
    </aside>
  );
}
