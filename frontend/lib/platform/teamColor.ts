/**
 * The team-colour rule (DESIGN.md "Chart colour"): team colours are data, so
 * they only mark a team's own line/fill/swatch, and only after passing the
 * checks the chart's surface demands — ≥ 3:1 contrast against `card` for
 * every colour, and ≥ 15 ΔE (OKLab ×100, the normal-vision floor) between the
 * away colour and whichever colour home resolved to. Each side walks its own
 * colour(s) first, then the shared `chart-cat-1`/`chart-cat-2`/`chart-cat-3`
 * fallback hexes (`CHART_FALLBACK`) — a fallback slot is an ordinary
 * candidate, not a free pass: it is checked against the same two rules as a
 * real team colour, so a fallback can never end up too close to whatever the
 * other side already resolved to (a real colour, or another fallback).
 */

/** `--card` per theme; test/teamColor.test.ts pins these to globals.css. */
export const CARD = { light: "#ffffff", dark: "#111b2e" } as const;
export type Theme = keyof typeof CARD;

/**
 * `--chart-cat-1`/`-2`/`-3` per theme, in that order — the fallback walk once
 * a team's own colour(s) fail contrast. test/teamColor.test.ts pins these to
 * globals.css, the same way CARD is pinned.
 */
export const CHART_FALLBACK: Record<Theme, readonly [string, string, string]> = {
  light: ["#2a78d6", "#eb6834", "#1baf7a"],
  dark: ["#3987e5", "#d95926", "#199e70"],
};

const MIN_CONTRAST = 3;
const MIN_DELTA_E = 15;

/** ESPN ships `ba0c2f`; accept that or `#ba0c2f`, return lowercase `#rrggbb`. */
export function normalizeHex(v: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((v ?? "").trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

function linear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}

/** WCAG 2 contrast ratio. */
export function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = linear(h);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function oklab(hex: string): [number, number, number] {
  const [r, g, b] = linear(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Euclidean OKLab distance ×100 (the dataviz validator's ΔE). */
export function deltaE(a: string, b: string): number {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
}

export type TeamColors = { color?: string | null; alt?: string | null };

/** A team's own colour(s), then the shared fallback slots, in priority order. */
function candidates(t: TeamColors, theme: Theme): string[] {
  const own = [t.color, t.alt].map(normalizeHex).filter((c): c is string => c !== null);
  return [...own, ...CHART_FALLBACK[theme]];
}

/**
 * Resolved colours: always `#rrggbb`, never a token reference. Home takes the
 * first candidate (its own colours, then the fallback slots) that clears
 * ≥ 3:1 against `card`. Away walks the same kind of list but must also clear
 * ≥ 15 ΔE from whatever home resolved to — including when both sides end up
 * on fallback slots, since a fallback is just another candidate here.
 */
export function pickTeamColors(
  home: TeamColors,
  away: TeamColors,
  theme: Theme
): { home: string; away: string } {
  const surface = CARD[theme];
  const legible = (c: string) => contrast(c, surface) >= MIN_CONTRAST;
  const h = candidates(home, theme).find(legible) ?? CHART_FALLBACK[theme][0];
  const a =
    candidates(away, theme).find((c) => legible(c) && deltaE(c, h) >= MIN_DELTA_E) ??
    CHART_FALLBACK[theme][1];
  return { home: h, away: a };
}
