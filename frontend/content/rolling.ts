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
 * `noise`: the median |delta_prev| over that league's qualified rows, seasons
 * 2025 + 2026, all of the entry's windows pooled (live read 2026-09-28). A move
 * smaller than the typical window-to-window move reads as noise (grey arrow).
 * EPA to 0.01, success rate (a 0–1 rate) to 0.001.
 */

export type RollingFormat = "epa" | "pct";

export type RollingMetric = {
  metric: string;
  unit: string;
  entity: "player" | "team";
  label: string;
  format: RollingFormat;
  noise: number;
  windows: number[];
};

export const ROLLING: Record<string, RollingMetric[]> = {
  cfb: [
    { metric: "epa", unit: "dropback", entity: "player", label: "EPA / dropback", format: "epa", noise: 0.18, windows: [50, 100, 300] },
    { metric: "success_rate", unit: "dropback", entity: "player", label: "Success rate / dropback", format: "pct", noise: 0.06, windows: [50, 100, 300] },
    { metric: "epa", unit: "target", entity: "player", label: "EPA / target", format: "epa", noise: 0.31, windows: [30, 60] },
    { metric: "success_rate", unit: "target", entity: "player", label: "Success rate / target", format: "pct", noise: 0.1, windows: [30, 60] },
    { metric: "epa", unit: "carry", entity: "player", label: "EPA / carry", format: "epa", noise: 0.15, windows: [50, 100] },
    { metric: "success_rate", unit: "carry", entity: "player", label: "Success rate / carry", format: "pct", noise: 0.06, windows: [50, 100] },
    { metric: "epa", unit: "play", entity: "team", label: "Team EPA / play", format: "epa", noise: 0.12, windows: [150, 300] },
    { metric: "success_rate", unit: "play", entity: "team", label: "Team success rate / play", format: "pct", noise: 0.047, windows: [150, 300] },
  ],
  nfl: [
    { metric: "epa", unit: "dropback", entity: "player", label: "EPA / dropback", format: "epa", noise: 0.19, windows: [50, 100, 300] },
    { metric: "success_rate", unit: "dropback", entity: "player", label: "Success rate / dropback", format: "pct", noise: 0.06, windows: [50, 100, 300] },
    { metric: "epa", unit: "target", entity: "player", label: "EPA / target", format: "epa", noise: 0.24, windows: [30, 60] },
    { metric: "success_rate", unit: "target", entity: "player", label: "Success rate / target", format: "pct", noise: 0.083, windows: [30, 60] },
    { metric: "epa", unit: "carry", entity: "player", label: "EPA / carry", format: "epa", noise: 0.12, windows: [50, 100] },
    { metric: "success_rate", unit: "carry", entity: "player", label: "Success rate / carry", format: "pct", noise: 0.07, windows: [50, 100] },
    { metric: "epa", unit: "play", entity: "team", label: "Team EPA / play", format: "epa", noise: 0.1, windows: [150, 300] },
    { metric: "success_rate", unit: "play", entity: "team", label: "Team success rate / play", format: "pct", noise: 0.037, windows: [150, 300] },
  ],
};
