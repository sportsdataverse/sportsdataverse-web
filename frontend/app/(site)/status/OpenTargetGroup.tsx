"use client";

import { useEffect } from "react";

/**
 * Opens the collapsed group a URL hash points at, on load and on every hash change, so a link such as
 * `/status#hoopR-nba-data` (the package cards use them) lands on an open group. The target may be a
 * `<details>` itself or anything inside one, nested groups included. Renders nothing, so the page around
 * it stays server-rendered.
 */
export default function OpenTargetGroup() {
  useEffect(() => {
    function openTarget() {
      let id: string;
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return; // a malformed %-escape: nothing to open
      }
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
    openTarget();
    window.addEventListener("hashchange", openTarget);
    return () => window.removeEventListener("hashchange", openTarget);
  }, []);
  return null;
}
