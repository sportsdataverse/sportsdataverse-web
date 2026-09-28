/**
 * Scroll `box` (an overflow container) just enough to show `el`, like
 * `el.scrollIntoView({ block: "nearest" })` but moving only `box`:
 * scrollIntoView also scrolls every scrollable ancestor, the window included,
 * so a chart hover that reveals a table row below the fold jumps the page.
 *
 * The target band is the part of `box`'s view that is on screen: its view
 * (below a sticky `thead`) clipped to `[0, window.innerHeight]`. A log that
 * runs past the fold would otherwise take the row to its own bottom edge,
 * off screen. A `box` wholly off screen falls back to its own view.
 */
export function revealInScroller(box: HTMLElement, el: HTMLElement): void {
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  let top = b.top + box.clientTop + (box.querySelector("thead")?.offsetHeight ?? 0);
  let bottom = b.top + box.clientTop + box.clientHeight;
  const [onTop, onBottom] = [Math.max(top, 0), Math.min(bottom, window.innerHeight)];
  if (onBottom > onTop) [top, bottom] = [onTop, onBottom];
  if (r.top < top) box.scrollTop += r.top - top;
  // Never past the row's top: in a band shorter than the row, show its top.
  else if (r.bottom > bottom) box.scrollTop += Math.min(r.bottom - bottom, r.top - top);
}
