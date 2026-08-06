"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import { Command as CommandIcon, LogOut, Menu, Moon, Sun } from "lucide-react";
import { Button } from "@components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@components/ui/sheet";
import { PLATFORM_TABS } from "./widgets";
import { PlatformNavList } from "./PlatformSidebar";
import { openCommandMenu } from "./CommandMenu";

function crumbFor(pathname: string): string {
  if (pathname.startsWith("/platform/pipelines/runs")) return "Pipeline run";
  if (pathname.startsWith("/platform/runs")) return "Model run";
  if (pathname.startsWith("/platform/models/")) return "Model";
  const tab = [...PLATFORM_TABS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((t) =>
      t.href === "/platform" ? pathname === "/platform" : pathname.startsWith(t.href)
    );
  return tab?.label ?? "Platform";
}

export default function PlatformTopbar({
  login,
  isAdmin = false,
}: {
  login: string | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname() ?? "/platform";
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur sm:px-4">
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger asChild className="md:hidden">
          <Button variant="ghost" size="icon" className="size-8" aria-label="Open platform menu">
            <Menu className="size-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-64 flex-col p-0 pt-10">
          <SheetTitle className="px-4 font-display text-sm font-bold uppercase tracking-wide">
            SDV Platform
          </SheetTitle>
          <PlatformNavList onNavigate={() => setMenuOpen(false)} isAdmin={isAdmin} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 items-baseline gap-2">
        <Link href="/platform" className="font-script text-sm text-primary">
          SDV
        </Link>
        <span className="font-mono text-xs text-muted-foreground">/</span>
        <span className="truncate font-display text-sm font-semibold">
          {crumbFor(pathname)}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-2 font-mono text-xs text-muted-foreground"
          onClick={openCommandMenu}
          aria-label="Open command menu"
        >
          <CommandIcon className="size-3" />
          <span className="hidden md:inline">K</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Toggle theme"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {mounted && resolvedTheme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 font-mono text-xs">
              @{login ?? "member"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="font-mono text-xs">
              sportsdataverse member
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
              <LogOut className="mr-2 size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
