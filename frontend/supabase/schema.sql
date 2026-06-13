-- ---------------------------------------------------------------------------
-- SportsDataverse web — Supabase schema
-- ---------------------------------------------------------------------------
-- This is the Supabase shape the app (frontend/lib/supabase.ts) expects. Run it
-- once in the Supabase SQL editor (or via the Supabase CLI) against the project
-- referenced by SUPABASE_URL / SUPABASE_KEY.
--
-- What uses what:
--   * `views`      — per-post view counter. Read + incremented on every blog
--                    post via /api/views/[slug] (getViewBySlug / addView).
--   * `views_sum()`— total view count, used by /api/views (getAllViews).
--
-- NOTE: the projects showcase no longer lives in Supabase — it moved to the
-- MongoDB `projects` collection (see frontend/pages/api/projects.ts), which is
-- the same store the packages CMS uses and supports org-member self-service.
--
-- Key choice: SUPABASE_KEY is server-only (used in API routes, never shipped to
-- the client). Set it to the project's **service_role** key so writes bypass
-- RLS with no policies required. If you instead use the **anon** key, uncomment
-- the RLS section at the bottom.
-- ---------------------------------------------------------------------------

-- Per-post view counter -----------------------------------------------------
create table if not exists public.views (
  slug       text primary key,
  views      bigint not null default 0,
  created_at timestamptz not null default now()
);

-- Total-views RPC (getAllViews) ---------------------------------------------
create or replace function public.views_sum()
returns bigint
language sql
stable
as $$ select coalesce(sum(views), 0) from public.views; $$;

-- ---------------------------------------------------------------------------
-- RLS — ONLY needed if SUPABASE_KEY is the anon (public) key. With the
-- service_role key these are unnecessary (RLS is bypassed). Uncomment to use:
-- ---------------------------------------------------------------------------
-- alter table public.views enable row level security;
--
-- create policy "views readable"   on public.views for select using (true);
-- create policy "views insertable" on public.views for insert with check (true);
-- create policy "views updatable"  on public.views for update using (true);
--
-- Policies gate row access, but the roles still need table-level privileges or
-- PostgREST returns a permission error even with policies in place:
-- grant select, insert, update on public.views to anon, authenticated;
-- grant execute on function public.views_sum() to anon, authenticated;
