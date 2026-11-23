-- =====================================================================
-- DayBoard: Import from Canvas (calendar feed sync)
--
-- Paste this whole file into the Supabase SQL editor and press Run.
-- It only adds what is missing and never deletes or changes your data.
-- Safe to run more than once.
-- =====================================================================

-- 1. Where an item came from, and what the student changed ---------------
-- source              'canvas' for imported items, null for items the student added
-- external_id         the Canvas calendar UID (stable across syncs)
-- external_url        link to the item in Canvas
-- source_hash         fingerprint of the last Canvas values, to spot changes
-- edited_fields       fields the student changed; sync never touches these again
-- removed_from_source true when the item disappeared from Canvas but was kept
-- hidden              the student hid it; it stays hidden on future syncs
-- source_date_changed Canvas moved the due date (shows a small note)

do $$
declare
  t text;
begin
  foreach t in array array['assignments', 'exams', 'events']
  loop
    execute format('alter table public.%I add column if not exists source text', t);
    execute format('alter table public.%I add column if not exists external_id text', t);
    execute format('alter table public.%I add column if not exists external_url text', t);
    execute format('alter table public.%I add column if not exists source_hash text', t);
    execute format('alter table public.%I add column if not exists edited_fields text[] not null default ''{}''', t);
    execute format('alter table public.%I add column if not exists removed_from_source boolean not null default false', t);
    execute format('alter table public.%I add column if not exists hidden boolean not null default false', t);
    execute format('alter table public.%I add column if not exists source_date_changed boolean not null default false', t);
    execute format('create unique index if not exists %I on public.%I (user_id, source, external_id) where external_id is not null', t || '_source_external_id_key', t);
  end loop;
end $$;

-- A short note on assignments and exams (imported from Canvas, or written by the student).
alter table public.assignments add column if not exists notes text;
alter table public.exams add column if not exists notes text;

-- Exams: plan study sessions automatically, and the exam date the current plan was made for.
alter table public.exams add column if not exists plan_study boolean not null default true;
alter table public.exams add column if not exists study_planned_for date;

-- 2. The student's Canvas connection -------------------------------------
-- feed_url is a secret (anyone with it can read the student's Canvas calendar).
-- Students can't read it back through the API: only the server (service role) can.

create table if not exists public.canvas_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  feed_url text not null,
  feed_host text,
  last_synced_at timestamptz,
  last_status text not null default 'never' check (last_status in ('never', 'ok', 'error', 'broken')),
  last_error text,
  etag text,
  last_modified text,
  settings jsonb not null default '{}'::jsonb,
  course_map jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.canvas_connections enable row level security;
revoke all on table public.canvas_connections from anon, authenticated;

-- Students can see their connection's status and settings, but never the feed link itself.
grant select (user_id, feed_host, last_synced_at, last_status, last_error, settings, course_map, created_at, updated_at)
  on table public.canvas_connections to authenticated;
grant delete on table public.canvas_connections to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'canvas_connections' and policyname = 'Canvas owner can read') then
    create policy "Canvas owner can read" on public.canvas_connections for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'canvas_connections' and policyname = 'Canvas owner can delete') then
    create policy "Canvas owner can delete" on public.canvas_connections for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;

-- 3. Deleting an account also removes the Canvas connection ---------------
-- (It already happens through "on delete cascade"; listed here so it's explicit.)

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  t text;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  foreach t in array array['canvas_connections', 'task_sessions', 'focus_sessions', 'habit_logs', 'habits', 'notes', 'events', 'assignments', 'exams', 'tasks', 'courses', 'user_settings']
  loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('delete from public.%I where user_id = $1', t) using me;
    end if;
  end loop;

  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
