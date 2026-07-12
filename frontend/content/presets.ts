/**
 * Quick-query presets for /platform/explore — CFBD-exporter-style parameter
 * forms for the most-used datasets: pick a season, fill 1-3 obvious fields,
 * run. Column names verified against the live parquet schemas (2026-07-12).
 * Datasets without a preset fall back to the generic asset picker + filter
 * builder unchanged.
 */

export type QuickField = {
  label: string;
  /** Columns the value applies to; >1 means OR across them (contains only). */
  cols: string[];
  kind: "number" | "equals" | "contains";
  placeholder?: string;
};

export type DatasetPreset = {
  /** Season asset name prefix, e.g. "play_by_play_" -> play_by_play_2024.parquet */
  assetPrefix: string;
  fields: QuickField[];
};

const HOOPS_PBP_FIELDS: QuickField[] = [
  {
    label: "Team",
    cols: ["home_team_name", "away_team_name"],
    kind: "contains",
    placeholder: "e.g. Duke",
  },
];

export const EXPLORE_PRESETS: Record<string, DatasetPreset> = {
  espn_cfb_pbp: {
    assetPrefix: "play_by_play_",
    fields: [
      { label: "Week", cols: ["week"], kind: "number", placeholder: "1-15" },
      { label: "Offense", cols: ["pos_team"], kind: "contains", placeholder: "e.g. Georgia" },
    ],
  },
  nfl_model_pbp: {
    assetPrefix: "model_pbp_",
    fields: [
      { label: "Week", cols: ["week"], kind: "number", placeholder: "1-18" },
      { label: "Offense", cols: ["posteam"], kind: "equals", placeholder: "e.g. KC" },
    ],
  },
  espn_mens_college_basketball_pbp: { assetPrefix: "play_by_play_", fields: HOOPS_PBP_FIELDS },
  espn_womens_college_basketball_pbp: { assetPrefix: "play_by_play_", fields: HOOPS_PBP_FIELDS },
  espn_nba_pbp: { assetPrefix: "play_by_play_", fields: HOOPS_PBP_FIELDS },
  espn_wnba_pbp: { assetPrefix: "play_by_play_", fields: HOOPS_PBP_FIELDS },
};

/** WHERE clause for the filled quick fields; empty string when none filled. */
export function quickWhere(fields: QuickField[], values: Record<string, string>): string {
  const clauses: string[] = [];
  for (const field of fields) {
    const value = (values[field.label] ?? "").trim();
    if (!value) continue;
    const escaped = value.replace(/'/g, "''");
    if (field.kind === "number") {
      if (/^-?\d+(\.\d+)?$/.test(value)) clauses.push(`"${field.cols[0]}" = ${value}`);
    } else if (field.kind === "equals") {
      clauses.push(`upper(CAST("${field.cols[0]}" AS VARCHAR)) = upper('${escaped}')`);
    } else {
      const ors = field.cols.map(
        (col) => `CAST("${col}" AS VARCHAR) ILIKE '%${escaped}%'`
      );
      clauses.push(ors.length > 1 ? `(${ors.join(" OR ")})` : ors[0]);
    }
  }
  return clauses.join(" AND ");
}
