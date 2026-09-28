/**
 * PNG export for the platform's hand-rolled SVG charts. A detached SVG drawn
 * through an <img> sees none of the page's CSS: no Tailwind classes
 * (`stroke-primary`), no custom properties, no web fonts. So the export copies
 * each element's computed paint and text styles inline, resolves any `var()`
 * left in the markup against the live page, and draws a header, legend and
 * footer on the canvas around it, in the fonts the page has already loaded.
 */

/** `var(--name)` or `var(--name, fallback)` whose fallback nests at most one
 *  pair of parens; deeper nesting resolves innermost-first, a pass at a time. */
const VAR = /var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\([^()]*\))*))?\)/g;

/**
 * Replaces every `var(--x)` / `var(--x, fallback)` in `css` with
 * `resolve("--x")`, or its fallback when that is "" (an unset property, as
 * `getPropertyValue` reports one). Fallbacks may nest (`var(--a, var(--b))`)
 * to any depth. An unset variable with no fallback is left as it was.
 */
export function inlineVars(css: string, resolve: (name: string) => string): string {
  // Bounded, so a resolver that answers with a var() can't spin forever.
  for (let pass = 0; pass < 16; pass++) {
    const next = css.replace(VAR, (m, name: string, fallback?: string) => resolve(name) || fallback?.trim() || m);
    if (next === css) break;
    css = next;
  }
  return css;
}

/** Computed styles copied inline onto every element of the exported SVG. */
const PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-opacity",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
];

export type LegendItem = { name: string; color: string; note?: string };

/**
 * Renders `svg` as it looks now (the active theme) to a PNG at the device's
 * pixel ratio (at least 2×): `title` and a swatch + name per `legend` item
 * above the chart, `footer` below, on the page's `--card` colour. Elements
 * marked `data-export-skip` (a hover overlay) are left out.
 */
export async function svgToPng(
  svg: SVGSVGElement,
  { title, footer, legend = [] }: { title: string; footer: string; legend?: LegendItem[] }
): Promise<Blob> {
  const cs = getComputedStyle(svg);
  const cssVar = (name: string) => cs.getPropertyValue(name).trim();

  const clone = svg.cloneNode(true) as SVGSVGElement;
  const live = [svg, ...svg.querySelectorAll("*")];
  [clone, ...clone.querySelectorAll("*")].forEach((el, i) => {
    const s = getComputedStyle(live[i]);
    el.setAttribute("style", PROPS.map((p) => `${p}:${s.getPropertyValue(p)}`).join(";"));
  });
  clone.querySelectorAll("[data-export-skip]").forEach((el) => el.remove());

  const { width: w, height: h } = svg.viewBox.baseVal;
  const scale = Math.max(2, window.devicePixelRatio || 1);
  // Rasterised at the pixel size it's drawn at, so it stays sharp.
  clone.setAttribute("width", String(w * scale));
  clone.setAttribute("height", String(h * scale));
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    inlineVars(new XMLSerializer().serializeToString(clone), cssVar)
  )}`;

  const family = (v: string) => [cssVar(v), "sans-serif"].filter(Boolean).join(", ");
  const fonts = {
    title: `700 22px ${family("--font-barlow-condensed")}`,
    body: `13px ${family("--font-inter")}`,
    foot: `11px ${family("--font-inter")}`,
  };
  await Promise.all([img.decode(), ...Object.values(fonts).map((f) => document.fonts.load(f))]);

  const pad = 16;
  const chartTop = pad + 34 + legend.length * 20;
  const H = chartTop + h + 30;
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  ctx.scale(scale, scale);
  const fg = cssVar("--foreground");
  const muted = cssVar("--muted-foreground");

  ctx.fillStyle = cssVar("--card");
  ctx.fillRect(0, 0, w, H);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = fg;
  ctx.font = fonts.title;
  ctx.fillText(title, pad, pad + 20, w - 2 * pad);

  ctx.font = fonts.body;
  legend.forEach(({ name, color, note }, k) => {
    const y = pad + 32 + k * 20;
    const paint = inlineVars(color, cssVar);
    // The fill's own paint, as on the page: the colour at 25% plus a 1px edge.
    ctx.beginPath();
    ctx.roundRect(pad + 0.5, y + 0.5, 11, 11, 2);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = paint;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = paint;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.fillText(name, pad + 18, y + 11);
    if (note) {
      ctx.fillStyle = muted;
      ctx.fillText(` · ${note}`, pad + 18 + ctx.measureText(name).width, y + 11);
    }
  });

  ctx.drawImage(img, 0, chartTop, w, h);

  ctx.fillStyle = muted;
  ctx.font = fonts.foot;
  ctx.fillText(footer, pad, H - 12, w - 2 * pad);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png")
  );
}
