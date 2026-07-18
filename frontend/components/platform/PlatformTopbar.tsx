"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { Command as CommandIcon, LogOut, Moon, Sun } from "lucide-react";
import { Button } from "@components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@components/ui/dropdown-menu";
import { PLATFORM_TABS } from "./widgets";
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

export default function PlatformTopbar({ login }: { login: string | null }) {
  const pathname = usePathname() ?? "/platform";
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur">
      <div className="flex items-baseline gap-2">
        <span className="font-script text-sm text-primary">SDV</span>
        <span className="font-mono text-xs text-muted-foreground">/</span>
        <span className="font-display text-sm font-semibold">{crumbFor(pathname)}</span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="hidden h-7 gap-2 font-mono text-xs text-muted-foreground md:inline-flex"
          onClick={openCommandMenu}
        >
          <CommandIcon className="size-3" /> K
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
