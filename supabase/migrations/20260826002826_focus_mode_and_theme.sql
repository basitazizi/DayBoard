create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'day' check (theme in ('day', 'night')),
  updated_at timestamptz not null default now()
);

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
  status text not null check (status in ('focus', 'paused', 'break', 'break_complete', 'completed')),
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

create unique index if not exists focus_sessions_one_active_user
  on public.focus_sessions(user_id)
  where status in ('focus', 'paused', 'break', 'break_complete');

create table if not exists public.task_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  focus_session_id uuid references public.focus_sessions(id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  duration integer not null check (duration >= 0),
  type text not null default 'focus' check (type = 'focus'),
  created_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.task_sessions enable row level security;

revoke all on table public.user_settings, public.focus_sessions, public.task_sessions from anon, authenticated;
grant select, insert, update on table public.user_settings to authenticated;
grant select, insert, update, delete on table public.focus_sessions to authenticated;
grant select, insert on table public.task_sessions to authenticated;

create policy "Users can view their settings" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their settings" on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their settings" on public.user_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users can view their focus sessions" on public.focus_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their focus sessions" on public.focus_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their focus sessions" on public.focus_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their focus sessions" on public.focus_sessions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can view their task sessions" on public.task_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their task sessions" on public.task_sessions for insert to authenticated with check ((select auth.uid()) = user_id);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_settings') then
    alter publication supabase_realtime add table public.user_settings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'focus_sessions') then
    alter publication supabase_realtime add table public.focus_sessions;
  end if;
end $$;
