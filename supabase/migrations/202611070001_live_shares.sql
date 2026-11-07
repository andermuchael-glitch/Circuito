-- Circuito: compartilhamento seguro de localização em tempo real.
create extension if not exists pgcrypto;

create table if not exists public.live_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  corrida_id text not null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  active boolean not null default true,
  latest_lat double precision,
  latest_lng double precision,
  accuracy double precision,
  speed double precision,
  updated_at timestamptz not null default now(),
  route_points jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, corrida_id)
);

alter table public.live_shares enable row level security;
revoke all on public.live_shares from anon;
grant select, insert, update on public.live_shares to authenticated;

drop policy if exists "Owners manage their live shares" on public.live_shares;
create policy "Owners manage their live shares"
on public.live_shares for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.get_live_share(p_token text)
returns table (
  corrida_id text,
  latest_lat double precision,
  latest_lng double precision,
  accuracy double precision,
  speed double precision,
  updated_at timestamptz,
  route_points jsonb,
  active boolean
)
language sql
security definer
set search_path = public
as $$
  select s.corrida_id, s.latest_lat, s.latest_lng, s.accuracy, s.speed,
         s.updated_at, s.route_points, s.active
  from public.live_shares s
  where s.token = p_token and s.active = true
  limit 1;
$$;

revoke all on function public.get_live_share(text) from public;
grant execute on function public.get_live_share(text) to anon, authenticated;

create or replace function public.stop_live_share(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  update public.live_shares
  set active = false, updated_at = now()
  where token = p_token and user_id = auth.uid();
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;
revoke all on function public.stop_live_share(text) from public;
grant execute on function public.stop_live_share(text) to authenticated;
