/**
 * The element id a link points at on /status, or null when the link goes anywhere else: `#id` and
 * `/status#id` (any origin-relative or absolute form that resolves to the /status page of `base`).
 * Pure, so the click handler's target resolution is unit-testable.
 */
export function statusHashId(href: string, base: string): string | null {
  let url: URL;
  let here: URL;
  try {
    url = new URL(href, base);
    here = new URL(base);
  } catch {
    return null;
  }
  if (url.origin !== here.origin || !url.hash) return null;
  if (url.pathname.replace(/\/$/, "") !== "/status") return null;
  try {
    return decodeURIComponent(url.hash.slice(1)) || null;
  } catch {
    return null; // a malformed %-escape: nothing to open
  }
}
