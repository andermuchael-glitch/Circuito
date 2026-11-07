-- Link permanente por estabelecimento: um token por conta, reutilizado em todas as corridas.
create extension if not exists pgcrypto;

create table if not exists public.permanent_live_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  payload jsonb not null default '{"active":false,"status":"idle"}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.permanent_live_shares enable row level security;
revoke all on public.permanent_live_shares from anon, authenticated;
grant select, insert, update on public.permanent_live_shares to authenticated;

drop policy if exists "Owners manage permanent live share" on public.permanent_live_shares;
create policy "Owners manage permanent live share"
on public.permanent_live_shares for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.create_permanent_live_share()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare result_token text;
begin
  insert into public.permanent_live_shares(user_id)
  values (auth.uid())
  on conflict (user_id) do update set updated_at = now()
  returning token into result_token;
  return result_token;
end;
$$;

create or replace function public.publish_permanent_live_share(p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.permanent_live_shares
  set payload = coalesce(p_payload, '{}'::jsonb), updated_at = now()
  where user_id = auth.uid();
  return found;
end;
$$;

create or replace function public.get_permanent_live_share(p_token text)
returns table(payload jsonb, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select s.payload, s.updated_at
  from public.permanent_live_shares s
  where s.token = p_token
  limit 1;
$$;

revoke all on function public.create_permanent_live_share() from public;
revoke all on function public.publish_permanent_live_share(jsonb) from public;
revoke all on function public.get_permanent_live_share(text) from public;
grant execute on function public.create_permanent_live_share() to authenticated;
grant execute on function public.publish_permanent_live_share(jsonb) to authenticated;
grant execute on function public.get_permanent_live_share(text) to anon, authenticated;
