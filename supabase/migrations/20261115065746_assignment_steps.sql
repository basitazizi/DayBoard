alter table public.assignments add column if not exists steps jsonb not null default '[]'::jsonb;
alter table public.focus_sessions add column if not exists total_rounds integer not null default 4 check (total_rounds between 1 and 25);
