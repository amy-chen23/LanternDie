create or replace function public.get_raw_upload_leaderboard(p_period text)
returns table (display_name text, verified_kills bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  period_start timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to view rankings.'
      using errcode = '42501';
  end if;

  if p_period = 'weekly' then
    period_start := date_trunc('week', now());
  elsif p_period = 'monthly' then
    period_start := date_trunc('month', now());
  else
    raise exception 'Period must be weekly or monthly.'
      using errcode = '22023';
  end if;

  return query
    select coalesce(cp.display_name, 'Field member'), count(*)::bigint
    from public.reports as r
    left join public.community_profiles as cp on cp.user_id = r.user_id
    where r.created_at >= period_start
    group by r.user_id, cp.display_name
    order by count(*) desc, coalesce(cp.display_name, 'Field member') asc;
end;
$$;

revoke all on function public.get_raw_upload_leaderboard(text) from public, anon;
grant execute on function public.get_raw_upload_leaderboard(text) to authenticated;
