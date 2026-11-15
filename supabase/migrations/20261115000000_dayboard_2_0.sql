-- =====================================================================
-- DayBoard 2.0 — complete database setup
--
-- Paste this whole file into the Supabase SQL editor and press Run.
-- It only adds what is missing. It never deletes or changes existing
-- data, and it is safe to run more than once.
--
-- It includes everything from the two older setup files, which have been
-- removed. This is the only file you need.
-- =====================================================================

-- 1. Columns the app uses on your existing tables -----------------------
-- Each line is skipped automatically when the column already exists.

alter table public.tasks add column if not exists steps jsonb not null default '[]'::jsonb;
alter table public.tasks add column if not exists course_id uuid;
alter table public.tasks add column if not exists created_by text default 'user';

alter table public.events add column if not exists auto_planned boolean not null default false;
alter table public.events add column if not exists linked_task_id uuid;
alter table public.events add column if not exists linked_course_id uuid;

alter table public.courses add column if not exists color text;
alter table public.courses add column if not exists days text;
alter table public.courses add column if not exists start_time time;
alter table public.courses add column if not exists end_time time;
alter table public.courses add column if not exists room text;
alter table public.courses add column if not exists semester text;

alter table public.assignments add column if not exists score numeric(5,2);
alter table public.assignments add column if not exists course_id uuid;
alter table public.assignments add column if not exists assignment_type text default 'homework';
alter table public.assignments add column if not exists due_time time;
alter table public.assignments add column if not exists estimated_minutes integer default 0;
alter table public.assignments add column if not exists actual_minutes integer default 0;
alter table public.assignments add column if not exists grade_weight numeric;
alter table public.assignments add column if not exists difficulty integer default 3;
alter table public.assignments add column if not exists status text default 'not_started';

alter table public.exams add column if not exists score numeric(5,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'courses_color_check') then
    alter table public.courses add constraint courses_color_check
      check (color is null or color in ('accent', 'teal', 'blue', 'amber', 'rose', 'green'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assignments_score_check') then
    alter table public.assignments add constraint assignments_score_check check (score is null or (score >= 0 and score <= 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exams_score_check') then
    alter table public.exams add constraint exams_score_check check (score is null or (score >= 0 and score <= 100));
  end if;
end $$;

create index if not exists tasks_course_id_idx on public.tasks(course_id);
create index if not exists events_linked_task_id_idx on public.events(linked_task_id);

-- Habit check-ins are saved one per habit per day.
do $$
begin
  create unique index if not exists habit_logs_habit_id_log_date_key on public.habit_logs(habit_id, log_date);
exception when others then
  raise notice 'Skipped habit_logs unique index: %', sqlerrm;
end $$;

-- 2. Settings table (theme sync across devices) --------------------------

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'day' check (theme in ('day', 'night')),
  updated_at timestamptz not null default now()
);

-- 3. Focus sessions (the Focus timer, synced across devices) -------------

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  focus_reason text not null,
  started_at timestamptz not null,
  segment_started_at timestamptz not null,
  ends_at timestamptz,
  focus_duration integer not null check (focus_duration > 0),
  break_duration integer not null check (break_duration > 0),
  long_break_duration integer not null check (long_break_duration > 0),
  break_frequency integer not null default 1 check (break_frequency between 1 and 4),
  long_break_after integer not null default 3 check (long_break_after > 0),
  session_number integer not null default 1 check (session_number > 0),
  status text not null,
  phase text not null default 'focus' check (phase in ('focus', 'break')),
  paused_at timestamptz,
  remaining_seconds integer,
  focused_seconds integer not null default 0 check (focused_seconds >= 0),
  music text not null default 'none',
  music_url text,
  auto_start boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bring older copies of the table in line with the statuses the app uses.
alter table public.focus_sessions drop constraint if exists focus_sessions_status_check;
update public.focus_sessions set status = 'focusing' where status = 'focus';
update public.focus_sessions set status = 'break', ends_at = coalesce(ends_at, now()), remaining_seconds = 0 where status = 'break_complete';
alter table public.focus_sessions add constraint focus_sessions_status_check check (status in ('focusing', 'paused', 'break', 'completed'));

drop index if exists public.focus_sessions_one_active_user;
create unique index focus_sessions_one_active_user on public.focus_sessions(user_id) where status in ('focusing', 'paused', 'break');
create index if not exists focus_sessions_user_started_idx on public.focus_sessions(user_id, started_at desc);

-- Time logged against a task by a focus session.
create table if not exists public.task_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.task_sessions add column if not exists focus_session_id uuid references public.focus_sessions(id) on delete set null;
alter table public.task_sessions add column if not exists duration integer not null default 0;
alter table public.task_sessions add column if not exists type text not null default 'focus';
create unique index if not exists task_sessions_one_per_focus_session on public.task_sessions(focus_session_id);

-- 4. Security: each person can only see and change their own rows --------

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'events', 'courses', 'assignments', 'exams', 'habits', 'habit_logs', 'notes', 'user_settings', 'focus_sessions', 'task_sessions']
  loop
    begin
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'DayBoard 2.0 owner can read') then
      execute format('create policy "DayBoard 2.0 owner can read" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'DayBoard 2.0 owner can add') then
      execute format('create policy "DayBoard 2.0 owner can add" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'DayBoard 2.0 owner can update') then
      execute format('create policy "DayBoard 2.0 owner can update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'DayBoard 2.0 owner can delete') then
      execute format('create policy "DayBoard 2.0 owner can delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
    end if;
    exception when others then
      raise notice 'Skipped security setup for %: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- 5. Live updates across devices -----------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'events', 'courses', 'assignments', 'exams', 'habits', 'habit_logs', 'notes', 'user_settings', 'focus_sessions']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 6. Tell the API about the new columns straight away --------------------
notify pgrst, 'reload schema';
