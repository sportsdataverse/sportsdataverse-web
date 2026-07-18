"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import { Menu, Moon, Sun, Terminal } from "lucide-react";
import { Button } from "@components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@components/ui/sheet";
import { cn } from "@lib/utils";

const LINKS = [
  { href: "/blog", label: "Blog" },
  { href: "/snippets", label: "Snippets" },
  { href: "/projects", label: "Projects" },
  { href: "/packages", label: "Packages" },
  { href: "/stats", label: "Stats" },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Button variant="ghost" size="icon" aria-label="Toggle theme" />;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

export default function SiteNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link href="/" className="mr-2 flex items-baseline gap-1">
          <span className="font-script text-lg leading-none text-primary">SportsDataverse</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                pathname?.startsWith(l.href) && "text-foreground"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {session?.isOrgMember ? (
            <Button asChild variant="outline" size="sm" className="hidden font-mono text-xs md:inline-flex">
              <Link href="/platform">
                <Terminal className="mr-1 size-3.5" /> platform
              </Link>
            </Button>
          ) : null}
          <ThemeToggle />
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <SheetTitle className="font-script text-primary">SportsDataverse</SheetTitle>
              <nav className="mt-6 flex flex-col gap-1">
                {LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                ))}
                {session?.isOrgMember ? (
                  <Link
                    href="/platform"
                    className="rounded-md px-3 py-2 font-mono text-sm text-primary hover:bg-secondary"
                  >
                    platform →
                  </Link>
                ) : null}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
