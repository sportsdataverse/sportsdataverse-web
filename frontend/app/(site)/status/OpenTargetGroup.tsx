"use client";

import { useEffect } from "react";
import { statusHashId } from "@lib/statusHash";

/**
 * Opens the collapsed group a URL hash points at, on load, on every hash change and on a click on a
 * link to a hash, so a link such as `/status#hoopR-nba-data` (the package cards use them) lands on an
 * open group, even when it is the hash already in the URL. The target may be a
 * `<details>` itself or anything inside one, nested groups included. Renders nothing, so the page around
 * it stays server-rendered.
 */
export default function OpenTargetGroup() {
  useEffect(() => {
    function openById(id: string) {
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      let opened = false;
      for (let group = target.closest("details"); group; group = group.parentElement?.closest("details") ?? null) {
        if (!group.open) {
          group.open = true;
          opened = true;
        }
      }
      // Content inside a closed group had no box when the browser scrolled to the hash.
      if (opened) target.scrollIntoView({ block: "start" });
    }
    function openTarget() {
      try {
        openById(decodeURIComponent(window.location.hash.slice(1)));
      } catch {
        // a malformed %-escape: nothing to open
      }
    }
    // Following a link to the hash already in the URL fires no hashchange, so a group the reader
    // closed would stay closed: open its target on the click itself.
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      const id = a ? statusHashId(a.getAttribute("href") ?? "", window.location.href) : null;
      if (id) openById(id);
    }
    openTarget();
    window.addEventListener("hashchange", openTarget);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", openTarget);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}
