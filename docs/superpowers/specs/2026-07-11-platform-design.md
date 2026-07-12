# SDV Platform — automation / dataset / model-run tracking & evaluation (design)

**Date:** 2026-07-11 · **Repo:** sportsdataverse-web · **Branch:** `feat/platform`
**Mode:** autonomous (goal-directed session). Design decisions are recorded here with
rationale; the PR is the human review gate.

## Goal

An org-members-only **`/platform`** area of sportsdataverse.org, behind the existing
GitHub-OAuth (NextAuth) layer, covering four pillars:

1. **Automation** — see the org's scheduled GitHub Actions pipelines (scrapers,
   data builders, live-test crons) across the data repos: latest run status,
   history, and a "run now" (`workflow_dispatch`) button.
2. **Datasets** — a registry of the `*-data` release artifacts: per-repo releases,
   assets, sizes, updated timestamps, links.
3. **Model training / tracking** — a run-tracking store (MongoDB) with a CI-friendly
   ingest API: training jobs POST a run record (params, metrics, oracle gates,
   artifacts, git provenance); the UI lists models and their runs.
4. **Evaluation** — per-model views: metric history across runs, oracle-gate
   pass/fail matrix, run detail with full payload.
5. **Database** (added mid-build per user request) — status of the Postgres
   warehouse on the sdv-data droplet. Its ports are deliberately closed to the
   public internet (post-incident hardening, 2026-07-08), so the site never
   dials the DB: a daily cron on the droplet PUSHES a heartbeat
   (`POST /api/platform/db-status`, ingest bearer token) with size/table/row
   stats + per-dataset freshness; the UI renders the latest snapshot per
   `source` (Mongo `db_status` collection, upserted) and flags heartbeats
   older than 26 h as stale.

## Non-goals (YAGNI)

- No artifact storage/upload (artifacts are links to GitHub releases — the org's
  established pattern for model bundles, e.g. `nfl_model_artifacts`).
- No experiment orchestration from the browser beyond `workflow_dispatch`.
- No per-user RBAC beyond the existing org-member boundary (all members equal,
  matching `/packages/manage` + `/projects/manage`).
- No charting library dependency — metric trends render as small inline SVG
  sparklines (hand-rolled, ~40 lines), keeping the bundle lean.
- No test framework introduction — the repo has none; the verification gate is
  `npm run tsc` + `npm run lint` + `npm run build` (matches existing practice).

## Approaches considered

- **A (chosen): build inside sdv-web** — Pages Router pages + API routes,
  NextAuth org-member gate, MongoDB for run tracking, GitHub REST for
  automation/datasets. Reuses every established pattern (`lib/auth.ts`
  `isOrgMember`, `pages/api/packages.ts` gating shape, `lib/mongodb.ts`,
  zod schemas in `lib/`, shadcn/Tailwind UI). Zero new infra.
- **B: self-hosted MLflow / W&B linked from the site** — richer tracking, but
  new infra to run/secure, not "part of the website", and the org's models are
  gate-driven (oracle gates) rather than epoch-loss-driven; MLflow's model is a
  poor fit. Rejected.
- **C: static dashboards from CI-committed JSON** — no auth story, no ingest,
  stale between crons. Rejected.

## Architecture

```text
frontend/
  content/platform.ts            # tracked-repo config (single source of truth)
  lib/platform/schemas.ts        # zod: ModelRun ingest/query schemas + TS types
  lib/platform/github.ts         # server-only GitHub REST helpers (runs, releases, dispatch)
  lib/platform/auth.ts           # requirePlatformSession / ingest-token check
  pages/api/platform/
    automation.ts                # GET workflows+latest runs | POST dispatch
    datasets.ts                  # GET releases summary per tracked repo
    runs.ts                      # GET run list (filters) | POST ingest
    runs/[id].ts                 # GET one | DELETE (org member)
    models.ts                    # GET registry (aggregate runs by model_id)
  pages/platform/
    index.tsx                    # overview: pillar cards + recent activity
    automation.tsx               # workflow dashboard + dispatch
    datasets.tsx                 # dataset/release registry
    models/index.tsx             # model registry
    models/[modelId].tsx         # evaluation: metric trends + gate matrix + runs
    runs/[id].tsx                # run detail
  components/platform/           # PlatformShell, StatusBadge, GateBadge,
                                 # Sparkline, RunTable, shared bits
docs (repo root): SETUP-platform.md   # env vars, PAT scopes, CI ingest recipe
```

### Auth model

- **Every `/platform` page** is gated in `getServerSideProps` via
  `getServerSession`; non-members get an in-page sign-in/join prompt (renders a
  minimal "members only" state rather than redirecting, matching `/packages/manage`).
- **Every `/api/platform/*` route requires an org-member session** — including
  GETs (the platform is private, unlike public `/api/packages` GET).
- **Exception:** `POST /api/platform/runs` (ingest) additionally accepts
  `Authorization: Bearer <PLATFORM_INGEST_TOKEN>` (timing-safe compare) so CI
  training jobs can log runs without a browser session. Fails closed when the
  env var is unset.

### GitHub access

- `GH_PLATFORM_TOKEN` (server-only env): fine-grained PAT with `actions:read`
  (+ `actions:write` for dispatch) on the org repos. Read endpoints fall back
  to unauthenticated GitHub REST (public repos work, rate-limited) when unset;
  `workflow_dispatch` returns 503 with a clear message when unset.
- All GitHub calls happen server-side in API routes (token never ships to the
  client); client pages fetch via SWR from `/api/platform/*`.

### Data model — `model_runs` collection (MongoDB)

```jsonc
{
  "model_id": "nfl_ep",              // stable slug, groups runs into a "model"
  "sport": "nfl",                    // nfl|cfb|nba|wnba|mbb|wbb|mlb|nhl|multi
  "run_name": "era-retrain-2026-07", // human label (optional)
  "status": "completed",             // running|completed|failed
  "params": { "eta": 0.025 },        // flat map, numbers/strings/bools
  "metrics": { "ep_corr": 0.996 },   // flat map, numbers
  "gates": [                          // oracle gates — the org's eval currency
    { "name": "ep_corr_vs_nflfastr", "threshold": 0.99, "observed": 0.996,
      "comparison": "gte", "passed": true }
  ],
  "artifacts": [{ "name": "ep_model.ubj", "url": "https://github.com/..." }],
  "git": { "repo": "sportsdataverse/nfl-data", "branch": "main", "sha": "..." },
  "tags": ["era-aware"],
  "notes": "optional markdown-ish text",
  "started_at": "ISO", "finished_at": "ISO",
  "created_by": "ci|<gh login>", "created_at": "ISO", "updated_at": "ISO"
}
```

Zod-validated on ingest; server stamps `created_by/created_at/updated_at` and
ignores client `_id`. The **model registry** is an aggregation (`$group` by
`model_id`): latest run, run count, latest gate summary, sports.

### Tracked repos (`content/platform.ts`)

A typed list of the org's automation/data repos, each with: `repo`,
`kind: "raw" | "data" | "package"`, `sport`, and optional
`workflows: string[]` allowlist (only allowlisted workflow files may be
dispatched — prevents dispatching arbitrary workflows). Seeded with the known
producers (nfl-raw/nfl-data, cfbfastR-raw/-data, hoopR/wehoop mirrors,
fastRhockey, sdv-py live-tests cron, sportsdataverse-data). Editing the list is
a code change — deliberate, reviewable.

### Error handling

- Auth failures: 401 JSON `{ message, success: false }` (existing shape).
- Zod failures: 400 with `errors: flatten()` (existing shape).
- GitHub REST failures: the API route returns 502 with the upstream status;
  pages render a non-fatal banner per section (one failing repo doesn't blank
  the dashboard — `Promise.allSettled` per repo).
- Mongo failures: 500, existing shape.

### UI

- `PlatformShell`: authenticated layout wrapper — left tab nav
  (Overview / Automation / Datasets / Models), session badge, sign-out.
  Reuses `Layout.tsx` + Tailwind + shadcn button/card idioms and dark mode.
- Status/gate badges: green/amber/red chips (lucide icons); sparklines are
  inline SVG. SWR for data with refresh intervals on the automation page.

## Explore (added 2026-07-12 — CFBD-exporter emulation)

Sixth surface: **`/platform/explore`** emulates collegefootballdata.com's
exporter (recon 2026-07-11: searchable category catalog → parameter form →
query → grid → CSV) over OUR release datasets:

- **Engine:** DuckDB-WASM in the browser (jsDelivr bundles, lazy). Queries
  parquet/csv release assets with HTTP range reads — only touched row groups
  download; no server compute.
- **CORS reality (verified by harness):** `github.com/releases/download` and
  the signed `release-assets.githubusercontent.com` target send NO CORS
  headers (OPTIONS → 405), so browsers cannot read release assets directly.
  `/api/platform/datasets/file` is a member-gated same-origin Range-passthrough
  proxy (server-side signed-URL resolve w/ 60 s cache, streams 206 ranges).
- **Flow:** dataset picker (sportsdataverse-data tags grouped by sport via
  `classifyReleaseTag`) → asset multi-select (`/api/platform/datasets/assets`,
  full paginated list) → schema-aware filter builder (column/op/value + limit)
  or free SQL mode → 500-row preview grid → full-result CSV download client-side.

## Phases (implementation order)

1. **Foundation** — config, schemas, platform auth helper, PlatformShell,
   gated `/platform` overview page, nav entry, env example updates.
2. **Automation** — GitHub helpers + `automation` API + dashboard + dispatch.
3. **Datasets** — releases API + registry page.
4. **Runs/Models** — ingest+query APIs, runs UI, model registry.
5. **Evaluation** — model detail (trends, gate matrix), run detail.
6. **Docs & verification** — SETUP-platform.md, CI ingest recipe (Python +
   `curl`), `tsc`/`lint`/`build` green, PR.

## Success criteria

- Signed-out / non-member users see a members-only prompt on every
  `/platform` page and 401 from every `/api/platform/*` call.
- An org member can: watch workflow statuses, dispatch an allowlisted
  workflow, browse dataset releases, and browse models/runs.
- A CI job can `POST /api/platform/runs` with the ingest bearer token and the
  run appears in the UI with gates rendered pass/fail.
- `npm run tsc`, `npm run lint`, `npm run build` all pass.
