create table private.report_location_metadata (
  report_id uuid primary key references public.reports (id) on delete cascade,
  latitude double precision,
  longitude double precision,
  location_source text,
  photo_taken_at_local timestamp without time zone,
  device_location_captured_at timestamptz,
  accuracy_meters double precision,
  share_approximate boolean not null default false,
  created_at timestamptz not null default now(),
  constraint report_location_coordinates_pair check ((latitude is null) = (longitude is null)),
  constraint report_location_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint report_location_longitude_range check (longitude is null or longitude between -180 and 180),
  constraint report_location_source_check check (location_source is null or location_source in ('photo_exif', 'device')),
  constraint report_location_source_coordinates check ((latitude is null) = (location_source is null)),
  constraint report_location_device_timestamp check (location_source is distinct from 'device' or device_location_captured_at is not null),
  constraint report_location_non_device_timestamp check (location_source is not distinct from 'device' or device_location_captured_at is null),
  constraint report_location_accuracy_check check (accuracy_meters is null or accuracy_meters >= 0),
  constraint report_location_share_requires_coordinates check (not share_approximate or latitude is not null)
);

alter table private.report_location_metadata enable row level security;
revoke all on private.report_location_metadata from public, anon, authenticated, service_role;

create function public.submit_report_with_location_metadata(
  p_photo_path text,
  p_observed_on date,
  p_place_name text,
  p_caption text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_source text,
  p_photo_taken_at_local timestamp without time zone,
  p_device_location_captured_at timestamptz,
  p_accuracy_meters double precision,
  p_share_approximate boolean
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
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitude and longitude must be provided together';
  end if;
  if (p_latitude is null) <> (p_location_source is null) then
    raise exception 'Location source is required only when coordinates are provided';
  end if;
  if p_location_source is not null and p_location_source not in ('photo_exif', 'device') then
    raise exception 'Unsupported location source';
  end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180) then
    raise exception 'Coordinates are out of range';
  end if;
  if p_location_source = 'device' and p_device_location_captured_at is null then
    raise exception 'Device location capture time is required';
  end if;
  if p_location_source is distinct from 'device' and p_device_location_captured_at is not null then
    raise exception 'Device capture time requires device location';
  end if;
  if p_share_approximate is null or (p_share_approximate and p_latitude is null) then
    raise exception 'Approximate sharing requires coordinates';
  end if;

  insert into public.reports (user_id, photo_path, observed_on, place_name, caption, visibility)
  values (v_user_id, p_photo_path, p_observed_on, p_place_name, p_caption, 'public')
  returning id into v_report_id;

  if p_latitude is not null or p_photo_taken_at_local is not null then
    insert into private.report_location_metadata (
      report_id, latitude, longitude, location_source, photo_taken_at_local,
      device_location_captured_at, accuracy_meters, share_approximate
    )
    values (
      v_report_id, p_latitude, p_longitude, p_location_source, p_photo_taken_at_local,
      p_device_location_captured_at, p_accuracy_meters, p_share_approximate
    );
  end if;

  return v_report_id;
end;
$$;

revoke all on function public.submit_report_with_location_metadata(
  text, date, text, text, double precision, double precision, text,
  timestamp without time zone, timestamptz, double precision, boolean
) from public, anon;
grant execute on function public.submit_report_with_location_metadata(
  text, date, text, text, double precision, double precision, text,
  timestamp without time zone, timestamptz, double precision, boolean
) to authenticated;
