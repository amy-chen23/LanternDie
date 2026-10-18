create schema if not exists private;

alter table public.reports
  add column observed_on date,
  add column place_name text,
  add column caption text,
  add column visibility text not null default 'private',
  add column upvotes integer not null default 0,
  add column downvotes integer not null default 0,
  add column inaccuracy_flags integer not null default 0,
  add column flagged_inaccurate boolean not null default false;

update public.reports set observed_on = created_at::date where observed_on is null;
alter table public.reports alter column observed_on set not null;
alter table public.reports alter column observed_on set default current_date;
alter table public.reports
  add constraint reports_visibility_check check (visibility in ('private', 'public')),
  add constraint reports_place_length_check check (place_name is null or char_length(place_name) between 1 and 100),
  add constraint reports_caption_length_check check (caption is null or char_length(caption) between 1 and 280),
  add constraint reports_observed_on_check check (observed_on <= current_date + 1),
  add constraint reports_counts_check check (upvotes >= 0 and downvotes >= 0 and inaccuracy_flags >= 0);

create index reports_public_created_at_idx on public.reports (created_at desc) where visibility = 'public';
revoke all on public.reports from authenticated;
grant select, delete on public.reports to authenticated;
grant insert (user_id, photo_path, observed_on, place_name, caption, visibility) on public.reports to authenticated;
grant update (observed_on, place_name, caption, visibility) on public.reports to authenticated;
create policy "Read public reports" on public.reports for select to authenticated
  using (visibility = 'public');
create policy "Edit own report details" on public.reports for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table public.community_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30)
);
alter table public.community_profiles enable row level security;
revoke all on public.community_profiles from anon;
revoke all on public.community_profiles from authenticated;
grant select on public.community_profiles to authenticated;
create policy "Read visible community names" on public.community_profiles for select to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.reports r where r.user_id = community_profiles.user_id and r.visibility = 'public'
  ));

create function private.sync_community_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare name text;
begin
  name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 30);
  if char_length(name) < 2 then name := 'Field member'; end if;
  insert into public.community_profiles (user_id, display_name) values (new.id, name)
  on conflict (user_id) do update set display_name = excluded.display_name;
  return new;
end;
$$;
revoke all on function private.sync_community_profile() from public, anon, authenticated;
create trigger sync_community_profile after insert or update of raw_user_meta_data on auth.users
  for each row execute function private.sync_community_profile();
insert into public.community_profiles (user_id, display_name)
select id, case when char_length(left(btrim(coalesce(raw_user_meta_data ->> 'display_name', '')), 30)) >= 2
  then left(btrim(raw_user_meta_data ->> 'display_name'), 30) else 'Field member' end
from auth.users
on conflict (user_id) do update set display_name = excluded.display_name;

create table public.report_votes (
  report_id uuid not null references public.reports (id) on delete cascade,
  voter_id uuid not null references auth.users (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (report_id, voter_id)
);
create index report_votes_voter_idx on public.report_votes (voter_id);
alter table public.report_votes enable row level security;
revoke all on public.report_votes from anon;
revoke all on public.report_votes from authenticated;
grant select, insert, update (value), delete on public.report_votes to authenticated;
create policy "Read own vote" on public.report_votes for select to authenticated
  using (voter_id = (select auth.uid()));
create policy "Vote on public reports" on public.report_votes for insert to authenticated
  with check (voter_id = (select auth.uid()) and exists (
    select 1 from public.reports r where r.id = report_id and r.visibility = 'public' and r.user_id <> (select auth.uid())
  ));
create policy "Change own vote" on public.report_votes for update to authenticated
  using (voter_id = (select auth.uid()))
  with check (voter_id = (select auth.uid()) and exists (
    select 1 from public.reports r where r.id = report_id and r.visibility = 'public' and r.user_id <> (select auth.uid())
  ));
create policy "Remove own vote" on public.report_votes for delete to authenticated
  using (voter_id = (select auth.uid()));

create table public.report_flags (
  report_id uuid not null references public.reports (id) on delete cascade,
  flagger_id uuid not null references auth.users (id) on delete cascade,
  primary key (report_id, flagger_id)
);
create index report_flags_flagger_idx on public.report_flags (flagger_id);
alter table public.report_flags enable row level security;
revoke all on public.report_flags from anon;
revoke all on public.report_flags from authenticated;
grant select, insert, delete on public.report_flags to authenticated;
create policy "Read own flag" on public.report_flags for select to authenticated
  using (flagger_id = (select auth.uid()));
create policy "Flag public reports" on public.report_flags for insert to authenticated
  with check (flagger_id = (select auth.uid()) and exists (
    select 1 from public.reports r where r.id = report_id and r.visibility = 'public' and r.user_id <> (select auth.uid())
  ));
create policy "Remove own flag" on public.report_flags for delete to authenticated
  using (flagger_id = (select auth.uid()));

create function private.refresh_report_votes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.reports set upvotes = upvotes + case when new.value = 1 then 1 else 0 end,
      downvotes = downvotes + case when new.value = -1 then 1 else 0 end where id = new.report_id;
  elsif tg_op = 'DELETE' then
    update public.reports set upvotes = upvotes - case when old.value = 1 then 1 else 0 end,
      downvotes = downvotes - case when old.value = -1 then 1 else 0 end where id = old.report_id;
  elsif old.value <> new.value then
    update public.reports set upvotes = upvotes + case when new.value = 1 then 1 else -1 end,
      downvotes = downvotes + case when new.value = -1 then 1 else -1 end where id = new.report_id;
  end if;
  return null;
end;
$$;
revoke all on function private.refresh_report_votes() from public, anon, authenticated;
create trigger refresh_report_votes after insert or update or delete on public.report_votes
  for each row execute function private.refresh_report_votes();

create function private.refresh_report_flags() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.reports set inaccuracy_flags = inaccuracy_flags + 1,
      flagged_inaccurate = true where id = new.report_id;
  else
    update public.reports set inaccuracy_flags = inaccuracy_flags - 1,
      flagged_inaccurate = inaccuracy_flags > 1 where id = old.report_id;
  end if;
  return null;
end;
$$;
revoke all on function private.refresh_report_flags() from public, anon, authenticated;
create trigger refresh_report_flags after insert or delete on public.report_flags
  for each row execute function private.refresh_report_flags();

drop policy "Read own report photos" on storage.objects;
create policy "Read visible report photos" on storage.objects for select to authenticated
  using (
    bucket_id = 'report-photos' and (
      (owner_id = (select auth.uid()::text) and (storage.foldername(name))[1] = (select auth.uid()::text))
      or exists (select 1 from public.reports r where r.photo_path = name and r.visibility = 'public')
    )
  );
