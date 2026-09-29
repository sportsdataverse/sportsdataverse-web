/**
 * Pinned rows in ResultsGrid: which column names a row, and the pinned rows
 * turned on their side for the comparison tray.
 */
import { pctSiblings } from "./scales.ts";

/** The most rows a grid pins at once (the tray's columns; the URL's `grid.pin`). */
export const MAX_PINS = 8;

const IDS = ["athlete_id", "player_id", "person_id", "team_id", "game_id"];

/** The first present of athlete_id, player_id, person_id, team_id, game_id, in
 *  that priority (not column order); -1 when there is none. */
export function identityColumn(columns: string[]): number {
  for (const id of IDS) {
    const i = columns.indexOf(id);
    if (i >= 0) return i;
  }
  return -1;
}

/** The identity column when it names every row once (no blank, no repeat), so a
 *  pin can be its value; else -1, and pins fall back to row indices. A result
 *  spanning seasons repeats a player's id. */
export function pinIdentity(columns: string[], rows: (string | null)[][]): number {
  const i = identityColumn(columns);
  if (i < 0) return -1;
  const seen = new Set<string>();
  for (const r of rows) {
    const v = r[i];
    if (v == null || v === "" || seen.has(v)) return -1;
    seen.add(v);
  }
  return i;
}

/** The column that names a row to a reader: the first `*name` column (player_name,
 *  passer_player_name), or a bare `team` (the ratings boards); -1 when there is none. */
export function labelColumn(columns: string[]): number {
  return columns.findIndex((c) => /(^|_)name$/.test(c) || c === "team");
}

/**
 * The pinned rows (ORIGINAL indices, in pin order) turned on their side: one
 * entry per column in column order, its values in pin order. The identity
 * column is left out (it heads the tray, or the label does), and so is each
 * producer `X_pct`, which only shades its `X`. `X_rank` and `X_n` stay, as
 * their own rows: each is one more number to compare, and the tray shows one
 * number per cell.
 */
export function transposePinned(
  columns: string[],
  rows: (string | null)[][],
  pinned: number[]
): { metric: string; values: (string | null)[] }[] {
  const id = identityColumn(columns);
  const pct = pctSiblings(columns);
  return columns.flatMap((metric, c) =>
    c === id || pct.get(c) === c ? [] : [{ metric, values: pinned.map((r) => rows[r][c]) }]
  );
}
