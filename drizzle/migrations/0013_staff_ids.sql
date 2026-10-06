create or replace function public.get_staff_ids()
returns table(user_id uuid, role app_role)
language sql stable security definer set search_path = public
as $$ select user_id, role from public.user_roles where role in ('admin','moderator') $$;
revoke all on function public.get_staff_ids() from public, anon;
grant execute on function public.get_staff_ids() to authenticated;