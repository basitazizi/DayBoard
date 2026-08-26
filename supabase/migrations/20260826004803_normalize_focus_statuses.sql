alter table public.focus_sessions drop constraint if exists focus_sessions_status_check;

update public.focus_sessions
set status = 'focusing'
where status = 'focus';

update public.focus_sessions
set status = 'break',
    ends_at = coalesce(ends_at, now()),
    remaining_seconds = 0
where status = 'break_complete';

alter table public.focus_sessions
  add constraint focus_sessions_status_check
  check (status in ('focusing', 'paused', 'break', 'completed'));

drop index if exists public.focus_sessions_one_active_user;
create unique index focus_sessions_one_active_user
  on public.focus_sessions(user_id)
  where status in ('focusing', 'paused', 'break');

create unique index if not exists task_sessions_one_per_focus_session
  on public.task_sessions(focus_session_id);

grant update on table public.task_sessions to authenticated;

create policy "Users can update their task sessions"
  on public.task_sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
