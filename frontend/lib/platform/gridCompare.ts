/**
 * Pinned rows in ResultsGrid: which column names a row, and the pinned rows
 * turned on their side for the comparison tray.
 */
import { pctSiblings } from "./scales.ts";
import { MAX_LEN, TOKEN } from "./viewState.ts";

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

/** The first id column, in identityColumn's priority, that names every row once
 *  with a value `grid.pin` carries back unchanged (TOKEN, at most MAX_LEN), so a
 *  pin can be its value; else -1, and pins are row indices for the session. A
 *  result spanning seasons repeats a player's id; a team's game log repeats
 *  team_id but not game_id. */
export function pinIdentity(columns: string[], rows: (string | null)[][]): number {
  for (const id of IDS) {
    const i = columns.indexOf(id);
    if (i < 0) continue;
    const seen = new Set<string>();
    const unique = rows.every((r) => {
      const v = r[i];
      if (v == null || v.length > MAX_LEN || !TOKEN.test(v) || seen.has(v)) return false;
      seen.add(v);
      return true;
    });
    if (unique) return i;
  }
  return -1;
}

/** The column that names a row to a reader: the first `*name` column (player_name,
 *  passer_player_name), or a bare `team` (the ratings boards); failing both, `pos_team`
 *  (the team tables: cfb.team_summaries names a team nowhere else); -1 when there is none. */
export function labelColumn(columns: string[]): number {
  const named = columns.findIndex((c) => /(^|_)name$/.test(c) || c === "team");
  return named >= 0 ? named : columns.indexOf("pos_team");
}

/**
 * The pinned rows (ORIGINAL indices, in pin order) turned on their side: one
 * entry per column in column order, its values in pin order. The columns that
 * head the tray are left out (`heads`: by default the identity column), and so
 * is each producer `X_pct`, which only shades its `X`. `X_rank` and `X_n` stay,
 * as their own rows: each is one more number to compare, and the tray shows
 * one number per cell.
 */
export function transposePinned(
  columns: string[],
  rows: (string | null)[][],
  pinned: number[],
  heads: number[] = [identityColumn(columns)]
): { metric: string; values: (string | null)[] }[] {
  const pct = pctSiblings(columns);
  return columns.flatMap((metric, c) =>
    heads.includes(c) || pct.get(c) === c ? [] : [{ metric, values: pinned.map((r) => rows[r][c]) }]
  );
}
