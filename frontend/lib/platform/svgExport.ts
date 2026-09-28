/**
 * PNG export for the platform's charts: one composite (a header, the chart, a
 * footer, on the page's `--card`, in the fonts the page has already loaded)
 * with two entry points. `svgToPng` takes a hand-rolled SVG chart: a detached
 * SVG drawn through an <img> sees none of the page's CSS (no Tailwind classes
 * like `stroke-primary`, no custom properties, no web fonts), so it copies
 * each element's computed paint and text styles inline and resolves any
 * `var()` left in the markup against the live page. `canvasToPng` takes a
 * canvas chart as a draw callback, so it is redrawn at the export's own size.
 */

/**
 * Loads every font spec, never failing: `FontFaceSet.load` rejects when ANY
 * face in a spec's family list errors, and next/font's fallback faces point at
 * `local(Arial)`, which a machine without it can't resolve, so one missing
 * fallback would sink the export even with Inter loaded. A face that fails just
 * leaves the canvas on the next family in the list.
 */
export async function loadFonts(fonts: Pick<FontFaceSet, "load">, specs: string[]): Promise<void> {
  await Promise.allSettled(specs.map((spec) => fonts.load(spec)));
}

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

/** A subtitle run: its text, after a dot swatch in `color` when set (a chip). */
export type SubtitleRun = { text: string; color?: string };

type Composite = {
  /** The chart's box in CSS px. */
  w: number;
  h: number;
  /** Device px per CSS px. */
  scale: number;
  title: string;
  footer: string;
  /** One line under the title: runs joined by " · ". */
  subtitle?: SubtitleRun[];
  legend?: LegendItem[];
  /** A custom property of the live page, "" when unset (`getPropertyValue`). */
  cssVar: (name: string) => string;
  /** Paints the chart, its box's top-left at (0, `top`) in CSS px. */
  drawChart: (ctx: CanvasRenderingContext2D, top: number) => void;
  /** Settles once the chart can be drawn (an image decoded). */
  ready?: Promise<unknown>;
};

/**
 * `title`, then the `subtitle` line and a swatch + name per `legend` item,
 * the chart, then `footer`: on the page's `--card` (never transparent), at
 * `scale`, encoded as a PNG.
 */
async function compositePng({ w, h, scale, title, footer, subtitle = [], legend = [], cssVar, drawChart, ready }: Composite): Promise<Blob> {
  const family = (v: string) => [cssVar(v), "sans-serif"].filter(Boolean).join(", ");
  const fonts = {
    title: `700 22px ${family("--font-barlow-condensed")}`,
    body: `13px ${family("--font-inter")}`,
    foot: `11px ${family("--font-inter")}`,
  };
  await Promise.all([ready, loadFonts(document.fonts, Object.values(fonts))]);

  const pad = 16;
  const rows = (subtitle.length ? 1 : 0) + legend.length;
  const chartTop = pad + 34 + rows * 20;
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
  if (subtitle.length) {
    // One line: plain runs muted, a chip in ink after a dot in its colour (as
    // the page's legend draws it), " · " between. A line too long for the
    // width is condensed to fit, as fillText's maxWidth condenses the title.
    const y = pad + 32;
    const sep = " · ";
    const dot = 14;
    const width = (r: SubtitleRun) => (r.color ? dot : 0) + ctx.measureText(r.text).width;
    const total = subtitle.reduce((a, r, i) => a + width(r) + (i ? ctx.measureText(sep).width : 0), 0);
    ctx.save();
    ctx.translate(pad, 0);
    ctx.scale(Math.min(1, (w - 2 * pad) / total), 1);
    let x = 0;
    subtitle.forEach((r, i) => {
      if (i) {
        ctx.fillStyle = muted;
        ctx.fillText(sep, x, y + 11);
        x += ctx.measureText(sep).width;
      }
      if (r.color) {
        ctx.beginPath();
        ctx.arc(x + 5, y + 6.5, 5, 0, Math.PI * 2);
        ctx.fillStyle = inlineVars(r.color, cssVar);
        ctx.fill();
        x += dot;
      }
      ctx.fillStyle = r.color ? fg : muted;
      ctx.fillText(r.text, x, y + 11);
      x += ctx.measureText(r.text).width;
    });
    ctx.restore();
  }
  legend.forEach(({ name, color, note }, k) => {
    const y = pad + 32 + (k + rows - legend.length) * 20;
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

  drawChart(ctx, chartTop);

  ctx.fillStyle = muted;
  ctx.font = fonts.foot;
  ctx.fillText(footer, pad, H - 12, w - 2 * pad);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png")
  );
}

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

  return compositePng({
    w,
    h,
    scale,
    title,
    footer,
    legend,
    cssVar,
    drawChart: (ctx, top) => ctx.drawImage(img, 0, top, w, h),
    ready: img.decode(),
  });
}

/**
 * A canvas chart to a PNG: `draw` paints the chart into a `w`×`h` CSS px box
 * (origin at its top-left) at `scale` device px per CSS px, between the same
 * header and footer as svgToPng. `host` is an element of the live page, for
 * its colours and fonts. Nothing may draw a cross-origin image, or the canvas
 * is tainted and `toBlob` throws (test/scatterDraw.test.ts guards the
 * scatter's drawing).
 */
export function canvasToPng(
  host: Element,
  opts: { w: number; h: number; scale: number; title: string; subtitle?: SubtitleRun[]; footer: string },
  draw: (ctx: CanvasRenderingContext2D, top: number) => void
): Promise<Blob> {
  const cs = getComputedStyle(host);
  return compositePng({
    ...opts,
    cssVar: (name) => cs.getPropertyValue(name).trim(),
    drawChart: (ctx, top) => {
      ctx.save();
      ctx.translate(0, top);
      draw(ctx, top);
      ctx.restore();
    },
  });
}
