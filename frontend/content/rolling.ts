/**
 * Rolling-form config for /platform/rolling: what F3's `{league}.rolling_windows`
 * actually publishes. Baked 2026-09-28 from one live read per league of season
 * 2026, `select=metric,window_n,window_unit&limit=50000`, and kept to its DISTINCT
 * (metric, window_unit, window_n) set. The two leagues publish the same set.
 *
 * `window_n` alone is ambiguous (50 is a carry AND a dropback window; 300 a
 * dropback AND a play window), so an entry is a metric × unit and every query
 * filters `window_unit` too. The unit fixes `entity_type` (only `play` is a team).
 *
 * `noise`, per window: the median |delta_prev| over that league's qualified rows
 * for that window, seasons 2025 + 2026 (live read 2026-09-28). A move smaller
 * than the typical window-to-window move reads as noise (grey arrow). Per window,
 * not pooled: the medians shrink roughly with 1/√n, and one pooled number greyed
 * 72–83% of 300-window moves. EPA to 0.01, success rate (a 0–1 rate) to 0.001.
 *
 * ponytail: the hero's delta vs season start is toned with this same delta_prev
 * noise, which errs conservative (|Δseason| runs ~0.6× |Δprev|, so more greys);
 * add a second per-window table from median |delta_season| if that bites.
 */

export type RollingFormat = "epa" | "pct";

export type RollingMetric = {
  metric: string;
  unit: string;
  entity: "player" | "team";
  label: string;
  format: RollingFormat;
  /** keyed by window_n; one per entry of `windows` */
  noise: Record<number, number>;
  windows: number[];
};

export const ROLLING: Record<string, RollingMetric[]> = {
  cfb: [
    { metric: "epa", unit: "dropback", entity: "player", label: "EPA / dropback", format: "epa", noise: { 50: 0.26, 100: 0.16, 300: 0.11 }, windows: [50, 100, 300] },
    { metric: "success_rate", unit: "dropback", entity: "player", label: "Success rate / dropback", format: "pct", noise: { 50: 0.08, 100: 0.05, 300: 0.037 }, windows: [50, 100, 300] },
    { metric: "epa", unit: "target", entity: "player", label: "EPA / target", format: "epa", noise: { 30: 0.31, 60: 0.29 }, windows: [30, 60] },
    { metric: "success_rate", unit: "target", entity: "player", label: "Success rate / target", format: "pct", noise: { 30: 0.1, 60: 0.1 }, windows: [30, 60] },
    { metric: "epa", unit: "carry", entity: "player", label: "EPA / carry", format: "epa", noise: { 50: 0.16, 100: 0.13 }, windows: [50, 100] },
    { metric: "success_rate", unit: "carry", entity: "player", label: "Success rate / carry", format: "pct", noise: { 50: 0.08, 100: 0.05 }, windows: [50, 100] },
    { metric: "epa", unit: "play", entity: "team", label: "Team EPA / play", format: "epa", noise: { 150: 0.13, 300: 0.1 }, windows: [150, 300] },
    { metric: "success_rate", unit: "play", entity: "team", label: "Team success rate / play", format: "pct", noise: { 150: 0.047, 300: 0.04 }, windows: [150, 300] },
  ],
  nfl: [
    { metric: "epa", unit: "dropback", entity: "player", label: "EPA / dropback", format: "epa", noise: { 50: 0.3, 100: 0.24, 300: 0.09 }, windows: [50, 100, 300] },
    { metric: "success_rate", unit: "dropback", entity: "player", label: "Success rate / dropback", format: "pct", noise: { 50: 0.08, 100: 0.06, 300: 0.037 }, windows: [50, 100, 300] },
    { metric: "epa", unit: "target", entity: "player", label: "EPA / target", format: "epa", noise: { 30: 0.25, 60: 0.22 }, windows: [30, 60] },
    { metric: "success_rate", unit: "target", entity: "player", label: "Success rate / target", format: "pct", noise: { 30: 0.1, 60: 0.067 }, windows: [30, 60] },
    { metric: "epa", unit: "carry", entity: "player", label: "EPA / carry", format: "epa", noise: { 50: 0.14, 100: 0.1 }, windows: [50, 100] },
    { metric: "success_rate", unit: "carry", entity: "player", label: "Success rate / carry", format: "pct", noise: { 50: 0.08, 100: 0.05 }, windows: [50, 100] },
    { metric: "epa", unit: "play", entity: "team", label: "Team EPA / play", format: "epa", noise: { 150: 0.12, 300: 0.07 }, windows: [150, 300] },
    { metric: "success_rate", unit: "play", entity: "team", label: "Team success rate / play", format: "pct", noise: { 150: 0.053, 300: 0.03 }, windows: [150, 300] },
  ],
};
