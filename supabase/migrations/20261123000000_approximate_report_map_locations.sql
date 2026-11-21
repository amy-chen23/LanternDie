drop function public.submit_report_with_location_metadata(
  text, date, text, text, double precision, double precision, text,
  timestamp without time zone, timestamptz, double precision, boolean
);
drop table private.report_location_metadata;

create table public.report_map_locations (
  report_id uuid primary key references public.reports (id) on delete cascade,
  latitude numeric(4, 2) not null check (latitude between -90 and 90),
  longitude numeric(5, 2) not null check (longitude between -180 and 180),
  created_at timestamptz not null default now()
);

alter table public.report_map_locations enable row level security;
revoke all on public.report_map_locations from public, anon, authenticated, service_role;
grant select on public.report_map_locations to authenticated;

create policy "Read approximate locations for community reports"
  on public.report_map_locations for select to authenticated
  using (
    exists (
      select 1
      from public.reports r
      where r.id = report_map_locations.report_id
        and r.visibility = 'public'
        and r.workflow_status in ('pending_detection', 'pending_review', 'admin_review', 'published')
    )
  );

create function public.submit_report_with_approximate_location(
  p_photo_path text,
  p_observed_on date,
  p_place_name text,
  p_caption text,
  p_share_approximate boolean,
  p_latitude double precision,
  p_longitude double precision
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_report_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in required';
  end if;
  if p_photo_path is null or p_photo_path not like v_user_id::text || '/%' then
    raise exception 'Photo must belong to the signed-in user';
  end if;
  if p_share_approximate is null then
    raise exception 'Map sharing choice is required';
  end if;
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitude and longitude must be provided together';
  end if;
  if p_share_approximate and p_latitude is null then
    raise exception 'A location fix is required to share a map pin';
  end if;
  if not p_share_approximate and p_latitude is not null then
    raise exception 'Coordinates cannot be sent without opting in to map sharing';
  end if;
  if p_latitude is not null and (
    p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180
  ) then
    raise exception 'Coordinates are out of range';
  end if;

  insert into public.reports (user_id, photo_path, observed_on, place_name, caption, visibility)
  values (v_user_id, p_photo_path, p_observed_on, p_place_name, p_caption, 'public')
  returning id into v_report_id;

  if p_share_approximate then
    insert into public.report_map_locations (report_id, latitude, longitude)
    values (v_report_id, round(p_latitude::numeric, 2), round(p_longitude::numeric, 2));
  end if;

  return v_report_id;
end;
$$;

revoke all on function public.submit_report_with_approximate_location(
  text, date, text, text, boolean, double precision, double precision
) from public, anon;
grant execute on function public.submit_report_with_approximate_location(
  text, date, text, text, boolean, double precision, double precision
) to authenticated;
