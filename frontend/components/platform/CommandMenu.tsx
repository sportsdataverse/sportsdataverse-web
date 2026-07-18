"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@components/ui/command";
import { PLATFORM_TABS } from "./widgets";

const OPEN_EVENT = "sdv:open-command-menu";

/** Imperative opener for the topbar button (no store needed). */
export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export default function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const openHandler = () => setOpen(true);
    document.addEventListener("keydown", down);
    window.addEventListener(OPEN_EVENT, openHandler);
    return () => {
      document.removeEventListener("keydown", down);
      window.removeEventListener(OPEN_EVENT, openHandler);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Go to…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Platform">
          {PLATFORM_TABS.map((tab) => (
            <CommandItem key={tab.href} onSelect={() => go(tab.href)}>
              {tab.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Site">
          <CommandItem onSelect={() => go("/")}>Home</CommandItem>
          <CommandItem onSelect={() => go("/blog")}>Blog</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
