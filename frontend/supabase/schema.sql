-- ---------------------------------------------------------------------------
-- SportsDataverse web — Supabase schema
-- ---------------------------------------------------------------------------
-- This is the database shape the app (frontend/lib/supabase.ts) expects. Run it
-- once in the Supabase SQL editor (or via the Supabase CLI) against the project
-- referenced by SUPABASE_URL / SUPABASE_KEY.
--
-- What uses what:
--   * `views`      — per-post view counter. Read + incremented on every blog
--                    post via /api/views/[slug] (getViewBySlug / addView).
--   * `views_sum()`— total view count, used by /api/views (getAllViews).
--   * `projects`   — pinned projects rendered on /projects (getProjects).
--
-- Key choice: SUPABASE_KEY is server-only (used in API routes + getStaticProps,
-- never shipped to the client). Set it to the project's **service_role** key so
-- writes bypass RLS with no policies required. If you instead use the **anon**
-- key, uncomment the RLS section at the bottom.
--
-- IMPORTANT: the `projects` columns coverImage / githubURL / previewURL are
-- created as QUOTED camelCase identifiers on purpose — the frontend reads them
-- straight off `select("*")` as project.coverImage etc., and unquoted Postgres
-- identifiers would fold to lowercase and break the mapping.
-- ---------------------------------------------------------------------------

-- 1. Per-post view counter --------------------------------------------------
create table if not exists public.views (
  slug       text primary key,
  views      bigint not null default 0,
  created_at timestamptz not null default now()
);

-- 2. Total-views RPC (getAllViews) ------------------------------------------
create or replace function public.views_sum()
returns bigint
language sql
stable
as $$ select coalesce(sum(views), 0) from public.views; $$;

-- 3. Pinned projects for /projects ------------------------------------------
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default '',
  description   text not null default '',
  "coverImage"  text,
  "githubURL"   text not null default '',
  "previewURL"  text,
  tools         text[] default '{}',
  pinned        boolean not null default false,
  created_at    timestamptz not null default now()
);

-- getProjects() filters on pinned = true and orders by created_at desc, so an
-- index there keeps the projects page query cheap.
create index if not exists projects_pinned_created_at_idx
  on public.projects (pinned, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS — ONLY needed if SUPABASE_KEY is the anon (public) key. With the
-- service_role key these are unnecessary (RLS is bypassed). Uncomment to use:
-- ---------------------------------------------------------------------------
-- alter table public.views    enable row level security;
-- alter table public.projects enable row level security;
--
-- create policy "views readable"    on public.views    for select using (true);
-- create policy "views insertable"  on public.views    for insert with check (true);
-- create policy "views updatable"   on public.views    for update using (true);
-- create policy "projects readable" on public.projects for select using (true);
--
-- grant execute on function public.views_sum() to anon, authenticated;
