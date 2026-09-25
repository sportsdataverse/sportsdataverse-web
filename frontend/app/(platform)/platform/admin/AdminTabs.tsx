"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@lib/utils";

const TABS = [
  { href: "/platform/admin", label: "Overview" },
  { href: "/platform/admin/traffic", label: "Traffic" },
  { href: "/platform/admin/keys", label: "Keys" },
  { href: "/platform/admin/errors", label: "Errors" },
  { href: "/platform/admin/site", label: "Site" },
];

export default function AdminTabs() {
  const pathname = usePathname() ?? "/platform/admin";
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {TABS.map((t) => {
        const active = t.href === "/platform/admin" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-full px-3 py-1 font-inter text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
