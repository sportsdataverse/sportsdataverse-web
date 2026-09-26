# DESIGN.md — "Night game broadcast"

The visual world is a night game under stadium lights, seen through broadcast
graphics: navy ink, chalk lines, one amber scoreboard glow. Tokens live in
`frontend/styles/globals.css` (Tailwind v4 `@theme`).

## Color

| Token | Light | Dark | Role |
|---|---|---|---|
| `background` | `#f6f8fb` chalk | `#0b1220` ink | page |
| `card` | `#ffffff` | `#111b2e` | surfaces |
| `foreground` | `#0e1626` | `#e9eef6` | text |
| `muted-foreground` | `#4d5b74` | `#93a1b8` | secondary text |
| `primary` | `#02507f` | `#4fb6e8` | interactive (SDV blue) |
| `accent` | `#08699e` | `#2e9bd6` | links, info |
| `score` / `score-ink` | `#ffb43c` / `#8a5300` | `#ffb43c` | THE accent — ticker, active markers, one underline per page |
| `status-*` | emerald/amber/rose/sky/zinc | same | run/workflow/freshness states, everywhere identical |

### Chart colour

Charts draw only from these slots (`lib/platform/chartTokens.ts` maps data onto
them; Tailwind classes `fill-chart-*` / `stroke-chart-*` / `bg-chart-*`).

| Token | Light | Dark | Role |
|---|---|---|---|
| `chart-cat-1` | `#2a78d6` | `#3987e5` | series 1 (blue) |
| `chart-cat-2` | `#eb6834` | `#d95926` | series 2 (orange) |
| `chart-cat-3` | `#1baf7a` | `#199e70` | series 3 (aqua) |
| `chart-cat-4` | `#4a3aa7` | `#9085e9` | series 4 (violet) |
| `chart-cat-5` | `#e87ba4` | `#d55181` | series 5 (magenta) |
| `chart-cat-6` | `#008300` | `#008300` | series 6 (green) |
| `chart-div-neg-3`, `chart-div-neg-2`, `chart-div-neg-1` | `destructive` mixed 100 / 66 / 33% into `chart-div-mid` | same | below baseline (worse) |
| `chart-div-mid` | `#e3e8ef` | `#2b3548` | at baseline (neutral slate) |
| `chart-div-pos-1`, `chart-div-pos-2`, `chart-div-pos-3` | `primary` mixed 33 / 66 / 100% into `chart-div-mid` | same | above baseline (better) |
| `chart-seq-1`, `chart-seq-2`, `chart-seq-3`, `chart-seq-4`, `chart-seq-5` | `primary` mixed 20 / 40 / 60 / 80 / 100% into `card` | same | magnitude (one hue) |

- **Categorical order is fixed and never cycled.** Validated on `card`
  (`#ffffff` / `#111b2e`) with the dataviz validator: worst adjacent CVD ΔE 9.2
  light / 9.4 dark, normal-vision ΔE ≥ 19.7. Scatter and other all-pairs forms
  use **slots 1–3 only** (all-pairs CVD ΔE 9.2 / 9.4) — a 4th slot fails a
  protan viewer outright: `chart-cat-1` vs `chart-cat-4` (dark blue vs violet)
  is normal-vision ΔE 9.8 but protan ΔE 1.9, which is why `ALL_PAIRS_CAP = 3`
  rather than 4. Past the cap, fold into "Other" or facet. `chart-cat-3` and
  `chart-cat-5` are under 3:1 on light `card` (2.82 and 2.69 respectively):
  charts that use them carry direct labels or a table view.
- **Diverging poles** (`primary` vs `destructive`): CVD ΔE 10.4 light / 15.7
  dark, both ≥ 3:1 on `card`. The "lightness band" check above is a
  categorical-series rule and does not apply to ramp endpoints — a diverging
  scale is read by position along the ramp, not by two marks pulled out of a
  legend.
- **No yellow or red token, but hue alone still collides with status.** No
  slot reuses `status-*` or `destructive`, yet measured OKLab ΔE finds
  near-misses that hue avoidance alone doesn't fix: light `chart-cat-3` vs
  `status-success` = 2.8, dark `chart-cat-5` vs `destructive` = 5.4
  (`destructive` is also `chart-div-neg-3`), light `chart-cat-5` vs
  `destructive` = 14.7, light `chart-cat-2` vs `destructive` = 12.3, light
  `chart-cat-2` vs `status-failed` = 9.4, dark `chart-cat-2` vs
  `status-failed` = 9.3. A status never carries meaning by hue alone — pair it
  with an icon and a label, or its fixed placement — and a categorical chart
  never shares a view with a diverging chart or an unlabeled status chip.
- **Team colours are data, not tokens.** They may mark a team's own line, fill
  or swatch in a chart that names the team in text. Never text colour, never a
  good/bad encoding, never a table-cell tint. Always pass them through
  `pickTeamColors` (`lib/platform/teamColor.ts`): every candidate — a team's
  own colour(s) and the `chart-cat-1`/`chart-cat-2`/`chart-cat-3` fallback
  walk alike — must clear ≥ 3:1 against `card`, and the away colour must also
  clear ≥ 15 ΔE (OKLab) from whatever home resolved to, including when home
  itself landed on a fallback slot. Team fills that land near the `score`
  amber are a known open question, parked for the owner.
- `chart-seq-1` sits at 1.42:1 light / 1.39:1 dark on `card` — fine for a
  heatmap fill with no text drawn on it, but a mark meant to be told apart by
  eye (an ordinal dot, a tier chip) starts at `chart-seq-2` (2.08 / 2.14).
- Grid lines stay `border`, axis text `muted-foreground`, the crosshair `score`
  (it counts toward the amber budget).

Amber discipline: the scoreboard amber appears in at most three places per
view (ticker, one active marker, one underline). It is never body text on
chalk (use `score-ink`), never a fill behind text.

## Type

- **Display**: Barlow Condensed 600/700 (self-hosted) — condensed caps for
  headlines, section heads, league chips, scoreboard numerics. Tracking ≥
  -0.02em; hero ceiling 6rem.
- **Body**: Inter (self-hosted variable). 65–75ch measure on prose.
- **Data**: mono stack — IDs, params, log lines, table numerics, the ticker.
- **Wordmark only**: Sarina script. Never for headings or UI.

## Signature

The **scoreboard ticker** under the public nav: a slim marquee of true
ecosystem facts in mono caps with amber square separators. It is the one
loud element; everything else stays disciplined.

## Components

shadcn/ui (new-york, RSC) restyled by the tokens; platform chrome =
labeled grouped sidebar + slim topbar + ⌘K. Status colors always come from
the `status-*` ramp — a run state chip on the platform and a freshness dot
on the site must read identically.

## Bans (project-specific, in addition to impeccable's)

- No gradient text, no glassmorphism, no side-stripe accent borders.
- No uppercase-tracked eyebrow repeated per section — the ticker + condensed
  section heads carry the cadence instead.
- Sarina outside the wordmark.
- New colors outside the token table (extend the table first).
