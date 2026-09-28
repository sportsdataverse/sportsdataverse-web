/**
 * Scroll `box` (an overflow container) just enough to show `el`, like
 * `el.scrollIntoView({ block: "nearest" })` but moving only `box`:
 * scrollIntoView also scrolls every scrollable ancestor, the window included,
 * so a chart hover that reveals a table row below the fold jumps the page.
 * A sticky `thead` inside `box` counts as covering the top of its view.
 */
export function revealInScroller(box: HTMLElement, el: HTMLElement): void {
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const viewTop = b.top + box.clientTop + (box.querySelector("thead")?.offsetHeight ?? 0);
  const viewBottom = b.top + box.clientTop + box.clientHeight;
  if (r.top < viewTop) box.scrollTop += r.top - viewTop;
  else if (r.bottom > viewBottom) box.scrollTop += r.bottom - viewBottom;
}
