# CLAUDE.md — sdv-web

The SportsDataverse organization website (`sportsdataverse.org`) — the marketing/landing
hub: home, blog (MDX), packages/projects directories, stats. Sibling to the docs sites
it links out to (`js.sportsdataverse.org` Docusaurus, the Python Docusaurus site, and the
per-package R pkgdown sites) — this repo is the org front door, NOT a docs site.

## Architecture

- **Framework:** Next.js 16 (Pages Router — `pages/`, no `app/`; `components.json` `rsc: false`),
  React 19, TypeScript 5.7, Tailwind 3 + shadcn/ui (style `new-york`, lucide icons).
- **The app lives in `frontend/`, NOT the repo root.** Run all node commands from `frontend/`.
  Repo root holds only the Python data-fetcher (`python/`) + workflows + a generated `requirements.txt`.
- **Content:** MDX rendered via `next-mdx-remote` + `gray-matter` + rehype (slug, autolink,
  pretty-code/shiki). `frontend/posts/*.mdx` = blog, `frontend/snippets/*.mdx` = code snippets,
  `frontend/static_pages/*.mdx` = about/privacy. `frontend/content/*.ts` = typed site data
  (meta, social, support, Framer Motion variants). `frontend/data/*.json` = seed projects/users.
- **Backends:** Supabase (`views` table + `views_sum()` RPC — page-view counter;
  schema in `frontend/supabase/schema.sql`) and **MongoDB** (`MONGODB_URI` + `DB_NAME` —
  packages/projects, NOT Supabase). Auth via NextAuth (GitHub OAuth). API routes in `pages/api/`.
- **Data pipeline:** `python/data_fetcher.py` (uv-managed) pulls GitHub/package stats; the
  `cron.yml` workflow runs it daily on the **`with-data` branch** and auto-commits results there.

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
- **`with-data` is a data branch, not a feature branch.** `cron.yml` commits fetched data to it;
  `auto-merge.yml` merges `main` → `with-data` on push to main, `merge-to-main.yml` merges back.
  Don't develop on `with-data`.
- **Turbopack root is pinned** in `next.config.ts` (`turbopack.root`) so a stray lockfile in the
  home dir isn't mis-detected as the workspace root — keep it when editing config.
- Two backends, easy to confuse: **views = Supabase, packages/projects = MongoDB.**

## Reference

- **Deploy:** Vercel (auto-deploy on push to `main`; project root = `frontend/`).
  `frontend/vercel.json` sets `cleanUrls`, immutable font caching, and `/home`→`/`,
  `/rss`→`/feed.xml`, `/sitemap`→`/sitemap.xml` redirects. No `netlify.toml`, no Pages workflow.
- **Domain:** sportsdataverse.org
- **Repo:** github.com/sportsdataverse/sportsdataverse-web
