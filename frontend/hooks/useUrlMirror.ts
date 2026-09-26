import { useEffect } from "react";

/**
 * Mirror a page's view state into the address bar so the URL reproduces the
 * view. history.replaceState, not router.replace: Next syncs it into
 * useSearchParams WITHOUT re-running the server component (Explore's page
 * would otherwise re-list GitHub releases on every keystroke), and a filter
 * tweak adds no Back-button entry.
 */
export default function useUrlMirror(params: URLSearchParams) {
  const qs = params.toString();
  useEffect(() => {
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", next);
    }
  }, [qs]);
}
