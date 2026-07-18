# sportsdataverse-web: App Router migration + platform orchestration observability

**Date:** 2026-07-17 · **Status:** approved design
**Scope:** full-site big-bang migration to the Next.js App Router, dark-first design
refresh, and end-to-end Prefect orchestration visibility in `/platform`.

## Goals

1. Whole site (27 pages, 17 API routes) on the App Router in one PR; Pages Router deleted.
2. Modernized dark-first look built on Tailwind v4 + shadcn/ui, shared token system
   across the public site and the platform workspace.
3. Full orchestration observability: trigger pipeline runs, watch the stage DAG execute,
   read live logs, see shared-budget state — all inside `/platform`, all flowing through
   `data.sportsdataverse.org` (the droplet's Prefect server stays localhost-only).

## Non-goals

- No new backends: Mongo (packages/projects/model-runs), Supabase (view counters),
  GitHub API layers stay as-is.
- No change to model-run telemetry ingest semantics (`POST /api/platform/runs`).
- No public exposure of the Prefect UI (SSH tunnel only).
- No content rewrite: MDX posts/snippets/static pages render as today, restyled.

## 1. Routing architecture

```
app/
├─ layout.tsx              # fonts (Inter var, Barlow, Sarina via next/font/local),
│                          # Providers (client): SessionProvider, ThemeProvider(next-themes),
│                          # Plausible, top-loader; Metadata API defaults
├─ (site)/                 # public, light editorial treatment
│  ├─ page.tsx             # home
│  ├─ about / privacy      # static_pages MDX via RSC
│  ├─ blog/ + blog/[slug]  # posts/*.mdx, generateStaticParams, next-mdx-remote/rsc
│  ├─ snippets(+[slug])
│  ├─ projects(+manage), packages(+manage), stats
├─ (platform)/platform/    # dense dark workspace, own layout: sidebar rail + topbar + ⌘K
│  ├─ page.tsx  (overview)
│  ├─ automation           # tabs: GitHub Workflows | Pipelines (new)
│  ├─ pipelines/runs/[id]  # NEW: orchestrator run detail (DAG, tasks, logs)
│  ├─ runs/[id]            # model-run detail (Mongo) — unchanged semantics
│  ├─ database, datasets, explore, lookups, models(+[modelId]), trends, wp
└─ api/                    # route handlers, IDENTICAL external paths (see §3)
```

- `pages/` is deleted in the same PR; `_app`/`_document` concerns move to `app/layout.tsx`.
- NProgress + router.events → `nextjs-toploader` (or equivalent) + per-segment
  `loading.tsx` skeletons; `error.tsx` + `not-found.tsx` per route group.
- `MetaData` component + `next/head` → Metadata API (`generateMetadata` on dynamic
  routes); feed.xml / sitemap.xml become route handlers reusing `lib/sitemap.ts`.
- MDX: keep `lib/MDXContent.ts` (gray-matter, reading-time, adjacent posts, TOC) but
  return raw source; render via `next-mdx-remote/rsc` `<MDXRemote>` in server components
  with the existing rehype chain (slug, autolink, pretty-code/shiki one-dark-pro).
  `MDXComponents` stay; interactive ones get `"use client"`.
- duckdb-wasm (Explore) stays client-only behind `next/dynamic`.
- SSG pages (blog, snippets, about, privacy, home) = static RSC; platform + manage
  pages = dynamic (auth), data fetched server-side where possible, SWR for live-refresh
  islands only.

## 2. Auth: NextAuth v4 → Auth.js v5

- `lib/auth.ts` → v5 `NextAuth()` returning `{ handlers, auth, signIn, signOut }`;
  `app/api/auth/[...nextauth]/route.ts` re-exports handlers.
- GitHub provider (`read:user read:org`), JWT strategy, and the 30-min org-membership
  revalidation callback port unchanged (same env vars).
- `platformSession` pageProp indirection is retired: platform layout/pages call `auth()`
  server-side; the platform layout renders a sign-in / not-a-member gate for
  unauthorized users. Client islands needing session use `useSession` under the
  provider.
- `lib/platform/auth.ts` adapts: `requireMember()` for route handlers reads `auth()`;
  `checkIngestToken` (timing-safe bearer, `PLATFORM_INGEST_TOKEN`) unchanged.

## 3. API route handlers — external contracts frozen

All 17 routes move to `app/api/**/route.ts` with **identical URLs, methods, params,
status codes, and auth**. Externally-consumed contracts (breakage = broken crons):

| Contract | Consumer |
|---|---|
| `POST /api/platform/db-status` (bearer ingest token) | droplet heartbeat timer |
| `POST /api/platform/runs` (bearer ingest token, zod `modelRunSchema`) | model-publish CI |
| `GET /api/platform/datasets/file` (ranged streaming) | platform downloads |
| `GET /api/revalidate?secret=` | on-demand ISR |

New platform proxy handlers (§5) live under `app/api/platform/orch/*`.

## 4. Design system

- **Tailwind v4** CSS-first: tokens defined in `@theme` (globals.css); `darkMode` via
  class strategy (`next-themes`). Typography plugin retained for MDX prose.
- **shadcn/ui** (new-york, RSC): button, card, table, tabs, dialog, sheet, dropdown,
  select, input, badge, skeleton, tooltip, sonner, command (⌘K palette listing pages +
  pipelines + recent runs).
- **Tokens:** near-black neutral base (dark-first), SDV blue accent family
  (from the current `#024F84`/`#0580AD` brand hues, tuned for dark bg), status ramp —
  emerald=success/completed, amber=running/pending, rose=failed/crashed,
  sky=scheduled/info, zinc=cancelled — used identically for workflow status, DB
  freshness, and run states. Radius 0.5rem retained.
- **Type:** Barlow (display/headings), Inter (UI/body), mono stack for IDs, params,
  log lines, table numerics; Sarina only as the brand script accent.
- **Public site:** same tokens, light-mode default with dark support, editorial layout
  (large type, generous whitespace, restyled post cards, kept view counters).
- **Platform:** collapsible icon-rail sidebar + sticky topbar (breadcrumb, theme toggle,
  ⌘K, user menu), dense tables, mono data values, live-status dot in the shell.

## 5. Orchestration observability

**Data path (only path):** Vercel RSC/route-handlers → `https://data.sportsdataverse.org`
(bearer `SDV_TRIGGER_KEY`, Vercel sensitive env; trigger-scoped key already minted) →
sdv-db API (sdv-orch router mounted) → Prefect REST on localhost.

### 5a. sdv-orch router extensions (`sdv_orch/api/runs.py`)

All verified against live Prefect 3.7.8 endpoints:

| Route | Proxies | Notes |
|---|---|---|
| `GET /v1/runs` (extend) | `flow_runs/filter` | add `state`, `deployment`, `limit/offset` params; return params + timestamps |
| `GET /v1/runs/{id}` (extend) | `flow_runs/{id}` | add params, timing, deployment name |
| `GET /v1/runs/{id}/graph` | `flow_runs/{id}/graph-v2` | nodes/edges/states for the DAG canvas |
| `GET /v1/runs/{id}/task-runs` | `task_runs/filter` | name, state, start/end, duration |
| `GET /v1/runs/{id}/logs` | `logs/filter` | paged (`limit`, `offset`), level + timestamp + message |
| `GET /v1/limits` | `concurrency_limits/filter` | tag, limit, active slot count |
| `POST /v1/runs/{id}/cancel` | `flow_runs/{id}/set_state` | trigger scope; CANCELLING/CANCELLED |

Read endpoints require `read` scope; create/cancel require `trigger`. Deployed by
restarting `sdv-db-api` (mount imports from the sdv-orch checkout; no sdv-db change).

### 5b. sdv-web proxy handlers

`app/api/platform/orch/{pipelines,runs,runs/[id],runs/[id]/{graph,task-runs,logs},limits}`
— member-gated (`requireMember`), forward to the data API with the server-side key,
short cache (`no-store` for run state/logs; 60s for pipelines/limits).

### 5c. UI

- **Automation → Pipelines tab:** pipeline cards from `/v1/pipelines` (sport, stages,
  arg style, budgets); trigger form (sport → seasons → stages multi-select → rescrape /
  backfill toggle) with optimistic toast + link to the new run; budget badges from
  `/v1/limits` (e.g. `stats_nba 1/1 in use`); recent-runs table (state chip, sport,
  deployment, started, duration), SWR polling 5s while any run is non-terminal, else 60s.
- **`/platform/pipelines/runs/[id]`:** header (name, state chip, deployment, params,
  started/duration, cancel button while active); **DAG canvas** (react-flow) fed by
  `/graph` once tasks exist, falling back to the registry's declared stage chain
  (rendered as scheduled nodes) before execution; node = stage/task with state color,
  duration, retry count; **task table** below; **log viewer**: mono, virtualized,
  level filter, follow-tail toggle, 5s polling until terminal state.
- **Model runs vs pipeline runs stay distinct routes** (`/platform/runs/[id]` Mongo doc
  vs `/platform/pipelines/runs/[id]` Prefect) — cross-linked where a model run's git
  metadata matches a pipeline.
- **SSH tunnel doc** for the native Prefect UI (`ssh -L 4200:127.0.0.1:4200 root@sdv-data`
  → http://localhost:4200) added to sdv-orch README + platform docs; no public exposure.

## 6. Rollout & verification

1. Branch `feat/app-router` in sportsdataverse-web; this spec is its first commit.
2. Internally phased commits: tooling (tw4/shadcn/deps) → auth v5 → app/ skeleton +
   layouts → public site → platform pages → orch API + UI → cleanup (`pages/` deleted).
3. Gates on the droplet before push: `npm run tsc` (strict), `npm run lint`,
   `npm run build`; dev-server smoke of key flows (blog post, sign-in redirect,
   automation, run detail) — full auth flows verified on the Vercel preview.
4. sdv-orch extensions land first (separate commit on the droplet, API restarted) so
   the Vercel preview has real endpoints to hit.
5. Single PR → Vercel preview → user review → merge. `vercel.json` (cleanUrls,
   font cache headers, redirects) preserved.
6. Post-merge checks: heartbeat POST still 200s (next timer run), model-run ingest
   contract via curl, org-member sign-in, a real pipeline trigger from prod UI.

## 7. Risks

- **Auth.js v5 port** (JWT org-membership callback, cookie/session continuity) —
  mitigated by porting auth first and smoke-testing sign-in on the preview early.
- **next-mdx-remote RSC mode** with rehype-pretty-code — verify one post before
  porting all; fall back to serialize-in-RSC if the rsc entrypoint misbehaves.
- **Tailwind 3→4** with typography plugin + legacy token names — legacy SDV color
  aliases kept during migration, removed in cleanup.
- **duckdb-wasm bundling** under App Router — keep client-only dynamic import,
  verify Explore loads in the preview.
- **Route-handler parity** for streamed downloads (`datasets/file`) — port carefully,
  test ranged requests.
- **External contracts** — §3 table double-checked in review; no path/auth changes.
