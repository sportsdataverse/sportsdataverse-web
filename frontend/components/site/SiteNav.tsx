"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useSession, signIn } from "next-auth/react";
import { Github, Menu, Moon, Sun, Terminal } from "lucide-react";
import { Button } from "@components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@components/ui/sheet";
import { cn } from "@lib/utils";

const LINKS = [
  { href: "/packages", label: "Packages" },
  { href: "/projects", label: "Projects" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
  { href: "/stats", label: "Stats" },
  { href: "/snippets", label: "Snippets" },
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

function MemberAction() {
  const { data: session, status } = useSession();
  if (status === "loading") return null;
  if (session?.isOrgMember) {
    return (
      <Button asChild size="sm" className="hidden gap-2 sm:inline-flex">
        <Link href="/platform">
          <Terminal className="size-3.5" /> Platform
        </Link>
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      className="hidden gap-2 sm:inline-flex"
      onClick={() => signIn("github", { callbackUrl: "/platform" })}
    >
      <Github className="size-3.5" /> Member sign in
    </Button>
  );
}

export default function SiteNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="mr-2 flex items-baseline gap-2">
          <span className="font-script text-xl leading-none text-primary">
            SportsDataverse
          </span>
        </Link>
        <nav className="hidden items-center md:flex">
          {LINKS.map((l) => {
            const active = pathname?.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative px-3 py-2 font-display text-[15px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground",
                  active &&
                    "text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-score"
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <MemberAction />
          <ThemeToggle />
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-6">
              <SheetTitle className="font-script text-xl text-primary">
                SportsDataverse
              </SheetTitle>
              <nav className="mt-6 flex flex-col gap-1">
                {LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="rounded-md px-3 py-2.5 font-display text-lg font-semibold uppercase tracking-wide text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                ))}
                {session?.isOrgMember ? (
                  <Link
                    href="/platform"
                    className="mt-2 rounded-md bg-primary px-3 py-2.5 text-center font-display text-lg font-semibold uppercase tracking-wide text-primary-foreground"
                  >
                    Platform
                  </Link>
                ) : (
                  <button
                    onClick={() => signIn("github", { callbackUrl: "/platform" })}
                    className="mt-2 rounded-md border border-border px-3 py-2.5 text-center font-display text-lg font-semibold uppercase tracking-wide text-foreground"
                  >
                    Member sign in
                  </button>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
