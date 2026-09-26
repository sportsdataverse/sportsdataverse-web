/**
 * The team-colour rule (DESIGN.md "Chart colour"): team colours are data, so
 * they only mark a team's own line/fill/swatch, and only after passing two
 * checks against the surface the chart renders on — ≥ 3:1 contrast with the
 * card, and ≥ 15 ΔE (OKLab ×100, the normal-vision floor) between the two
 * teams. Failing that: the team's alternate colour, then a categorical slot.
 */
import { chartVar } from "./chartTokens.ts";

/** `--card` per theme; test/teamColor.test.ts pins these to globals.css. */
export const CARD = { light: "#ffffff", dark: "#111b2e" } as const;
export type Theme = keyof typeof CARD;

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

/** Resolved colours: `#rrggbb`, or a categorical slot `var(...)` fallback. */
export function pickTeamColors(
  home: TeamColors,
  away: TeamColors,
  theme: Theme
): { home: string; away: string } {
  const surface = CARD[theme];
  const legible = (t: TeamColors) =>
    [t.color, t.alt]
      .map(normalizeHex)
      .filter((c): c is string => c !== null && contrast(c, surface) >= MIN_CONTRAST);
  const h = legible(home)[0] ?? chartVar("cat-1");
  const a =
    legible(away).find((c) => !h.startsWith("#") || deltaE(c, h) >= MIN_DELTA_E) ?? chartVar("cat-2");
  return { home: h, away: a };
}
