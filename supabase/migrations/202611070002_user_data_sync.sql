create table if not exists public.circuito_user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.circuito_user_data enable row level security;
grant select, insert, update on public.circuito_user_data to authenticated;
drop policy if exists "Users manage own Circuito data" on public.circuito_user_data;
create policy "Users manage own Circuito data" on public.circuito_user_data
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
