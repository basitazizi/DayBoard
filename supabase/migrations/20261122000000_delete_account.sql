-- DayBoard: let people delete their own account (required by Google Play).
-- Paste into the Supabase SQL editor and press Run. Safe to run more than once.
--
-- Creates delete_my_account(). When a signed-in person calls it, it removes
-- everything they own and then their sign-in account. It can only ever delete
-- the account of the person calling it.

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

  -- Children first, so nothing is left pointing at a deleted row.
  foreach t in array array['task_sessions', 'focus_sessions', 'habit_logs', 'habits', 'notes', 'events', 'assignments', 'exams', 'tasks', 'courses', 'user_settings']
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
