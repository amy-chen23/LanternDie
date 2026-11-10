-- Current-account discovery only. Membership stays in app_admins, referencing
-- the existing auth.users UUID; never trust user-editable account metadata.
create function public.get_my_admin_status() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.is_report_admin();
$$;
revoke all on function public.get_my_admin_status() from public,anon,authenticated,service_role;
grant execute on function public.get_my_admin_status() to authenticated;
