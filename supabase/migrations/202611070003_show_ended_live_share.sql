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
  select s.corrida_id, s.latest_lat, s.latest_lng,
         s.accuracy, s.speed, s.updated_at,
         s.route_points, s.active
  from public.live_shares s
  where s.token = p_token
  limit 1;
$$;

revoke all on function public.get_live_share(text) from public;
grant execute on function public.get_live_share(text)
to anon, authenticated;
