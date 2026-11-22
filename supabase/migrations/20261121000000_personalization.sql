-- DayBoard: profile and personalisation sync
-- Paste into the Supabase SQL editor and press Run. Safe to run more than once.
-- Lets each person's avatar, profile, colours, font, background and dashboard
-- layout follow them to every device they sign in on.
-- Run 20261115000000_dayboard_2_0.sql first if you have not already.

alter table public.user_settings add column if not exists prefs jsonb;
alter table public.user_settings add column if not exists profile jsonb;

-- Keeps a single row small: the avatar photo is resized in the browser,
-- so anything this large means something went wrong.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_settings_profile_size_check') then
    alter table public.user_settings add constraint user_settings_profile_size_check
      check (profile is null or pg_column_size(profile) < 200000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_settings_prefs_size_check') then
    alter table public.user_settings add constraint user_settings_prefs_size_check
      check (prefs is null or pg_column_size(prefs) < 50000);
  end if;
end $$;

notify pgrst, 'reload schema';
