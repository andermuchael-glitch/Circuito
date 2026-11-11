-- Permite rotacionar o token do link permanente (gera um novo endereço).
create or replace function public.rotate_permanent_live_share()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare result_token text;
begin
  -- Remove o registro atual do usuário (se existir) e cria um novo com token fresco.
  delete from public.permanent_live_shares where user_id = auth.uid();
  insert into public.permanent_live_shares(user_id)
  values (auth.uid())
  returning token into result_token;
  return result_token;
end;
$$;

revoke all on function public.rotate_permanent_live_share() from public;
grant execute on function public.rotate_permanent_live_share() to authenticated;
