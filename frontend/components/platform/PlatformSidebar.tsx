"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Workflow,
  Database,
  Search,
  BookOpen,
  Percent,
  TrendingUp,
  Boxes,
  HardDrive,
  KeyRound,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@components/ui/tooltip";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/platform": LayoutDashboard,
  "/platform/automation": Workflow,
  "/platform/datasets": Database,
  "/platform/explore": Search,
  "/platform/lookups": BookOpen,
  "/platform/wp": Percent,
  "/platform/trends": TrendingUp,
  "/platform/models": Boxes,
  "/platform/database": HardDrive,
  "/platform/api-key": KeyRound,
};

import { PLATFORM_TABS } from "./widgets";

export default function PlatformSidebar() {
  const pathname = usePathname() ?? "";
  return (
    <aside className="sticky top-0 z-30 flex h-dvh w-14 shrink-0 flex-col items-center gap-1 border-r border-border/60 bg-card/50 py-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/"
            className="mb-2 flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Back to site</TooltipContent>
      </Tooltip>
      {PLATFORM_TABS.map((tab) => {
        const Icon = ICONS[tab.href] ?? LayoutDashboard;
        const active =
          tab.href === "/platform"
            ? pathname === "/platform"
            : pathname.startsWith(tab.href);
        return (
          <Tooltip key={tab.href}>
            <TooltipTrigger asChild>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  active && "bg-primary/15 text-primary"
                )}
              >
                <Icon className="size-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{tab.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </aside>
  );
}
