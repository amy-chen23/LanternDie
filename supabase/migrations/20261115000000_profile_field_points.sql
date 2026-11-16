-- Field points are a member-visible aggregate. Private report details remain
-- protected by RLS; only their net vote contribution is included here.
create or replace function public.get_profile_field_points(profile_user_id uuid)
returns bigint language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if profile_user_id is null then raise exception 'Profile user is required'; end if;
  return (select coalesce(sum(r.upvotes::bigint - r.downvotes::bigint), 0)
    from public.reports r where r.user_id = profile_user_id);
end;
$$;
revoke all on function public.get_profile_field_points(uuid) from public, anon;
grant execute on function public.get_profile_field_points(uuid) to authenticated;
