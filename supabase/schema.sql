-- Bi-Weekly Budget — Supabase schema (Phase 3: real auth + per-user RLS)
-- Run this in your Supabase project: SQL Editor -> New query -> paste -> Run.
--
-- This replaces the Phase 2 starter model (a text "sync code" anyone with the
-- anon key could read/write) with rows scoped to a real signed-in user via
-- Supabase Auth's magic-link email sign-in. Two devices share one budget by
-- signing in with the same email — nothing to type or leak.

create table if not exists public.budget_state (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  state       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.budget_state enable row level security;

drop policy if exists "personal read/write" on public.budget_state;
drop policy if exists "owner read/write" on public.budget_state;
create policy "owner read/write" on public.budget_state
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Migrating from the Phase 2 (sync-code) table? There's no automatic migration —
-- the old table has no notion of a real user, so old rows can't be re-keyed by
-- auth.uid() without the owner signing in first. Export your data from the app
-- (Settings -> Backup -> Export JSON) before switching, then re-import it once
-- you've signed in on the new schema.
