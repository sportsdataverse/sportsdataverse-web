/**
 * Canvas plumbing for the platform's dense charts (hundreds to thousands of
 * marks, past what SVG draws smoothly).
 */

/**
 * Back the canvas with CSS px × devicePixelRatio device pixels and scale the
 * context by the ratio, so drawing code works in CSS px and stays crisp at
 * DPR 2. The backing store is reallocated only when that size changes (a
 * resize, a DPR change); otherwise it is cleared. Call it before each draw.
 */
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  dpr: number = globalThis.devicePixelRatio || 1
): CanvasRenderingContext2D {
  const [w, h] = [Math.round(cssW * dpr), Math.round(cssH * dpr)];
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * A theme token's current colour: a hidden probe inside `host` takes
 * `color: var(<cssVar>)` and the computed colour is read back, so the canvas
 * uses exactly what the CSS does in the active theme (never a copied hex).
 */
export function resolveColor(
  host: HTMLElement,
  cssVar: string,
  computed: (el: Element) => { color: string } = (el) => getComputedStyle(el)
): string {
  const probe = host.ownerDocument.createElement("span");
  probe.style.display = "none";
  probe.style.color = `var(${cssVar})`;
  host.appendChild(probe);
  const color = computed(probe).color;
  host.removeChild(probe);
  return color;
}
