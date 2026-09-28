/**
 * Canvas plumbing for the platform's dense charts (hundreds to thousands of
 * marks, past what SVG draws smoothly).
 */

/**
 * Back the canvas with CSS px × devicePixelRatio device pixels and scale the
 * context by the ratio, so drawing code works in CSS px and stays crisp at
 * DPR 2. Resetting width/height clears the canvas: call it before each draw.
 */
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  dpr: number = globalThis.devicePixelRatio || 1
): CanvasRenderingContext2D {
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");
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
