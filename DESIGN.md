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
| `accent` | `#0b84c4` | `#2e9bd6` | links, info |
| `score` / `score-ink` | `#ffb43c` / `#8a5300` | `#ffb43c` | THE accent — ticker, active markers, one underline per page |
| `status-*` | emerald/amber/rose/sky/zinc | same | run/workflow/freshness states, everywhere identical |

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
