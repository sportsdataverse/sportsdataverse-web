# CLAUDE.md — sdv-web

The SportsDataverse organization website (`sportsdataverse.org`) — the marketing/landing
hub: home, blog (MDX), packages/projects directories, stats. Sibling to the docs sites
it links out to (`js.sportsdataverse.org` Docusaurus, the Python Docusaurus site, and the
per-package R pkgdown sites) — this repo is the org front door, NOT a docs site.

## Architecture

- **Framework:** Next.js 16 **App Router** (`app/` route groups `(site)` + `(platform)`; `components.json` `rsc: true`),
  React 19, TypeScript 5.7, **Tailwind 4** (CSS-first tokens in `frontend/styles/globals.css`) + shadcn/ui
  (style `new-york`, lucide icons). Auth.js v5. Design system: see root `DESIGN.md` / `PRODUCT.md`.
- **The app lives in `frontend/`, NOT the repo root.** Run all node commands from `frontend/`.
  Repo root holds only the Python data-fetcher (`python/`) + workflows + a generated `requirements.txt`.
- **Content:** MDX rendered via `next-mdx-remote` + `gray-matter` + rehype (slug, autolink,
  pretty-code/shiki). `frontend/posts/*.mdx` = blog, `frontend/snippets/*.mdx` = code snippets,
  `frontend/static_pages/*.mdx` = about/privacy. `frontend/content/*.ts` = typed site data
  (meta, social, support, Framer Motion variants). `frontend/data/*.json` = seed projects/users.
- **Backends:** Supabase (`views` table + `views_sum()` RPC — page-view counter;
  schema in `frontend/supabase/schema.sql`) and **MongoDB** (`MONGODB_URI` + `DB_NAME` —
  packages/projects, NOT Supabase). Auth via Auth.js v5 (GitHub OAuth, org-membership JWT). API route handlers in `frontend/app/api/`.
- **Data pipeline:** `python/data_fetcher.py` (uv-managed) pulls GitHub/package stats; the
  `cron.yml` is **manual-only** (`workflow_dispatch`); it has never committed anything, because
  the fetcher's luigi targets land under `python/tmp/`, which the repo does not track.

## Commands

All from `frontend/` (uses npm + `legacy-peer-deps`; README mentions yarn but the lockfile is `package-lock.json`):

```sh
cd frontend
npm install            # .npmrc forces legacy-peer-deps (React 19 peer ranges)
npm run dev            # next dev (localhost:3000)
npm run build          # next build
npm run start          # next start (serve the production build)
npm run lint           # eslint .  (flat config: eslint.config.mjs)
npm run tsc            # tsc --noEmit
```

Python data-fetcher (from repo-root `python/`, requires uv 0.4+):

```sh
cd python
uv sync
uv run python data_fetcher.py      # needs SUPABASE_URL, SUPABASE_KEY, TOKEN
uv lock --upgrade && uv sync       # bump deps
```

## Conventions

- **Never add AI co-author trailers to commits** (no `Co-Authored-By` referencing Claude/Copilot/etc.).
- Path aliases (`tsconfig.json` + `components.json`): `@components`, `@lib`, `@lib/utils`,
  `@components/ui`, `@hooks`. Add shadcn components with `npx shadcn@latest add ...` from `frontend/`.
- Next config (`frontend/next.config.ts`): remote images use `images.remotePatterns`
  (Next 16 dropped `domains`); allowed hosts are githubusercontent/cloudinary/imgur only —
  add new image hosts there. `typescript.ignoreBuildErrors: false` (build fails on type errors).
- `.env.local` (template `frontend/.env.example`) is required to run — keys span Supabase,
  MongoDB, NextAuth/GitHub, Mailchimp, Google Analytics, EmailJS, `REVALIDATE_SECRET`.

## Gotchas

- **`legacy-peer-deps=true` (`.npmrc`) is load-bearing** — React 19 trips peer-range checks
  on several deps; a plain `npm install` without it can fail. Don't remove it.
- **Repo-root `requirements.txt` is generated** (`uv export --project python`), used only by
  `cron.yml`'s `pip install`. Edit deps in `python/pyproject.toml` + re-export; don't hand-edit it.
- **The `with-data` round-trip is retired.** `auto-merge.yml` (main → with-data) and
  `merge-to-main.yml` (with-data → main) are gone. The branch still exists but is no longer
  synced and holds no data — don't develop on it, and don't restore the round-trip without
  first making the fetcher write to tracked paths.
- **Turbopack root is pinned** in `next.config.ts` (`turbopack.root`) so a stray lockfile in the
  home dir isn't mis-detected as the workspace root — keep it when editing config.
- Two backends, easy to confuse: **views = Supabase, packages/projects = MongoDB.**

## Visual verification — REQUIRED for any UI change

Any change that touches a rendered page, a component, MDX content, or styles — including
"just a copy/colour tweak" — is not done until it has been seen in **all four combinations**:

|                    | light | dark |
|--------------------|-------|------|
| desktop (1280×800) | ✓     | ✓    |
| mobile (390×844)   | ✓     | ✓    |

- **Theme is next-themes, `defaultTheme="dark"`, `attribute="class"`** (`app/providers.tsx`). Emulating
  `prefers-color-scheme` alone never shows light mode, and resizing a window is not a mobile check.
  `frontend/scripts/visual-check.mjs` seeds next-themes' `theme` key in localStorage before load,
  emulates the matching scheme, and fails if `<html>` did not get that class.
- `cd frontend && BASE=<url> npm run visual-check -- / /packages` writes `frontend/img/visual/`
  (git-ignored). `playwright-core` is deliberately not a dependency (`npm i -g playwright-core`); it drives
  your installed Chrome or `$VISUAL_CHECK_EXECUTABLE` (`VISUAL_CHECK_NO_SANDBOX=1` in a root container).
- `/platform/**` is behind GitHub org auth; shoot public `(site)` routes unless you have a session.

## PR evidence — REQUIRED on every PR, posted automatically

Every PR that touches `frontend/` carries two pieces of evidence, both produced by
**`.github/workflows/pr-evidence.yml`** and kept in ONE PR comment that each push updates:

1. **The four preview screenshots** of the PR (the matrix above), above-the-fold thumbnails linking to full pages.
2. **A Lighthouse comparison of the PR against its base** on the same page(s).

- **Nothing is built in CI.** Vercel deploys every commit with the real environment and reports it to GitHub's
  deployments API. The workflow waits for the **Preview** deployment of the PR head and compares it with the
  **Production** deployment of the PR's merge-base (falling back to the live site if Vercel no longer lists one).
- **Pages:** an `Evidence routes: /a /b` line in the PR description (max 4); default `/ /packages`.
- **Fork PRs** get no evidence run (read-only token, no authorized preview) — attach the matrix by hand.
- **When the workflow fails** (usually: the Vercel preview failed to build), fix the cause or explain in the PR;
  never paste numbers the workflow did not measure.
- **Local run:** `cd frontend && npm run lighthouse-compare -- --base-url https://sportsdataverse.org --head-url <preview url> --shots / /packages`,
  then `node scripts/pr-evidence-comment.mjs --out img/lighthouse/<run>` for the comment markdown.

Why the method is what it is (the scripts enforce it):
- **Warm-up:** each route is fetched twice on both deployments before measuring, so a cold serverless render
  or an edge-cache miss does not land on one side.
- **Run ranges and floors** (`frontend/scripts/lighthouse-verdicts.mjs`, pinned by `npm run test:scripts`):
  Performance swings 10+ points between identical builds. Every metric keeps its min–max range, and a delta
  is flagged only when the gap between the base and PR ranges clears an absolute floor **and** the median
  moved by a relative floor (Performance, already a 0–100 score, needs only the 3-point gap). These rules
  came from false flags on game-on-paper-app, where the same tooling runs.
- **Server response is reported, never flagged:** Production and Preview differ in edge-cache state.
- **Preview artifacts are neutralized, not flagged:** every Vercel Preview injects the Vercel Toolbar
  (`vercel.live` feedback.js + a 35 KB iframe) and sends `X-Robots-Tag: noindex`. Both tools block `vercel.live`
  on both sides, and `is-crawlable` is left out of the verdicts when only the preview is noindex (the SEO row is
  footnoted). Without this, every PR read as +65 KB JS and SEO 100 → 66.
- **Images** go on the orphan branch `pr-previews` (`pr<N>/<sha7>/…`), embedded through
  `raw.githubusercontent.com` URLs pinned to the commit SHA; no workflow triggers on that branch.

## Reference

- **Deploy:** Vercel (auto-deploy on push to `main`; project root = `frontend/`).
  `frontend/vercel.json` sets `cleanUrls`, immutable font caching, and `/home`→`/`,
  `/rss`→`/feed.xml`, `/sitemap`→`/sitemap.xml` redirects. No `netlify.toml`, no Pages workflow.
- **Domain:** sportsdataverse.org
- **Repo:** github.com/sportsdataverse/sportsdataverse-web
