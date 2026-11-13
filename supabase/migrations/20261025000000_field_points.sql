-- Include every report owned by the caller, regardless of visibility.
-- Use invoker permissions so existing report row-level security still applies.
create function public.get_field_points() returns bigint
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(sum(upvotes::bigint - downvotes::bigint), 0)
  from public.reports
  where user_id = (select auth.uid());
$$;

revoke all on function public.get_field_points() from public, anon;
grant execute on function public.get_field_points() to authenticated;
