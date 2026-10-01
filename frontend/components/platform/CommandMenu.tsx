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
import { platformPathFor, type SearchHit } from "@lib/platform/searchRoutes";
import { PLATFORM_TABS } from "./widgets";

const OPEN_EVENT = "sdv:open-command-menu";
/** Keystrokes settle this long before one search goes out. */
export const SEARCH_DEBOUNCE_MS = 200;
const MIN_CHARS = 2;
const MAX_ENTITIES = 8;
const MAX_DATASETS = 5;

/** Imperative opener for the topbar button (no store needed). */
export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * ⌘K: entities (players, teams, games, seasons from F10's search index, ranked
 * there), sportsdataverse-data release tags, then the page navigation. The
 * dialog filters itself (cmdk's `shouldFilter` is per palette, not per group):
 * the entity hits keep the server's order, the tags and the navigation match
 * the query as a substring. Picking a hit opens its view with URL state
 * (`platformPathFor`); a hit with no view is not listed.
 */
export default function CommandMenu({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The newest search that landed, with the query it answered: a query it
  // does not match is still pending (its own fetch is in flight or debounced).
  const [result, setResult] = useState<{ q: string; hits: SearchHit[]; failed?: boolean }>({ q: "", hits: [] });
  // Every release tag, read once per mount on the first open.
  const [tags, setTags] = useState<string[] | null>(null);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setQuery("");
        setResult({ q: "", hits: [] });
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

  useEffect(() => {
    if (!open || tags !== null) return;
    let cancelled = false;
    fetch("/api/platform/datasets/tags")
      .then((res) => (res.ok ? res.json() : { message: [] }))
      .then((body: { message?: unknown }) => {
        if (!cancelled) setTags(Array.isArray(body.message) ? body.message.filter((t): t is string => typeof t === "string") : []);
      })
      .catch(() => {
        if (!cancelled) setTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tags]);

  const q = query.trim();
  useEffect(() => {
    if (q.length < MIN_CHARS) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/platform/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`search ${res.status}`);
        const body: unknown = await res.json();
        setResult({ q, hits: Array.isArray(body) ? (body as SearchHit[]) : [] });
      } catch {
        // aborted by a newer keystroke: its own fetch takes over. Anything else (offline, a 502 from
        // the proxy, a bad body) answers this query as failed, so the palette neither stays on
        // "Searching…" nor claims "No results." for a search that never ran.
        if (!ctrl.signal.aborted) setResult({ q, hits: [], failed: true });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  // Closing by any path (a pick, Escape, the overlay) clears the query and the last hits, so the
  // palette reopens empty rather than flashing the previous search's hits.
  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setQuery("");
      setResult({ q: "", hits: [] });
    }
  };

  const go = (href: string) => {
    onOpenChange(false);
    if (href.startsWith("http")) {
      window.open(href, "_blank", "noopener");
    } else if (new URL(href, window.location.origin).pathname === window.location.pathname) {
      // The view a hit opens may be the one on screen (a season hit from Explore): its client seeds
      // state from the URL once, so a soft push would change the URL and keep the old view.
      window.location.assign(href);
    } else {
      router.push(href);
    }
  };

  const needle = q.toLowerCase();
  const pending = q.length >= MIN_CHARS && result.q !== q;
  // The last landed hits stay listed while a newer query is pending, so the list does not blink.
  const entities = (q.length < MIN_CHARS ? [] : result.hits)
    .map((hit) => ({ hit, href: platformPathFor(hit) }))
    .filter((e): e is { hit: SearchHit; href: string } => e.href !== null)
    .slice(0, MAX_ENTITIES);
  const datasets = q.length < MIN_CHARS ? [] : (tags ?? []).filter((t) => t.toLowerCase().includes(needle)).slice(0, MAX_DATASETS);
  const matches = (label: string) => !needle || label.toLowerCase().includes(needle);
  const platformTabs = PLATFORM_TABS.filter((tab) => (!tab.adminOnly || isAdmin) && matches(tab.label));
  const siteLinks = [
    { href: "/", label: "Home" },
    { href: "/blog", label: "Blog" },
  ].filter((l) => matches(l.label));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false} title="Search">
      <CommandInput placeholder="Search players, teams, games, datasets, or go to…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{pending ? "Searching…" : result.failed ? "Search is unavailable right now." : "No results."}</CommandEmpty>
        {entities.length > 0 && (
          <CommandGroup heading="Entities">
            {entities.map(({ hit, href }) => (
              <CommandItem
                key={`${hit.type}:${hit.league}:${hit.id}`}
                value={`${hit.type} ${hit.league} ${hit.id}`}
                data-hit-type={hit.type}
                data-hit-id={hit.id}
                data-hit-league={hit.league}
                onSelect={() => go(href)}
              >
                <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-wide opacity-70">{hit.type}</span>
                <span className="truncate">{hit.label}</span>
                {hit.sublabel && <span className="ml-auto shrink-0 pl-2 text-xs opacity-70">{hit.sublabel}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {datasets.length > 0 && (
          <CommandGroup heading="Datasets">
            {datasets.map((tag) => (
              <CommandItem key={`dataset:${tag}`} value={`dataset ${tag}`} data-hit-type="dataset" data-hit-id={tag} onSelect={() => go(platformPathFor({ type: "dataset", id: tag, label: tag, league: "" }) ?? "/platform/explore")}>
                <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-wide opacity-70">dataset</span>
                <span className="truncate font-mono text-xs">{tag}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {platformTabs.length > 0 && (
          <CommandGroup heading="Platform">
            {platformTabs.map((tab) => (
              <CommandItem key={tab.href} value={`nav ${tab.href}`} onSelect={() => go(tab.href)}>
                {tab.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {siteLinks.length > 0 && (
          <CommandGroup heading="Site">
            {siteLinks.map((l) => (
              <CommandItem key={l.href} value={`nav ${l.href}`} onSelect={() => go(l.href)}>
                {l.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
