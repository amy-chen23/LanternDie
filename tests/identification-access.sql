-- Run ONLY in an empty, disposable PostgreSQL database. All objects roll back.
-- psql -v ON_ERROR_STOP=1 -d <scratch_database> -f tests/identification-access.sql
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create table public.reports (id uuid primary key, user_id uuid not null, visibility text not null);
alter table public.reports enable row level security;
grant select on public.reports to authenticated;
create policy visible on public.reports for select to authenticated
  using (user_id = (select auth.uid()) or visibility = 'public');

\ir ../supabase/migrations/20261019180000_report_identification.sql

insert into public.reports values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'private'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'public');

set local role service_role;
do $$ begin
  assert public.claim_report_identification('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001');
  assert not public.claim_report_identification('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000002');
  assert public.claim_report_identification('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000003');
end $$;
reset role;

do $$ begin
  assert not has_table_privilege('anon', 'public.report_identifications', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.report_identifications', 'INSERT');
  assert not has_table_privilege('authenticated', 'public.report_identifications', 'UPDATE');
  assert not has_table_privilege('authenticated', 'public.report_identifications', 'DELETE');
  assert not has_function_privilege('authenticated', 'public.claim_report_identification(uuid,uuid)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.claim_report_identification(uuid,uuid)', 'EXECUTE');
end $$;

set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$ begin
  assert (select count(*) = 1 from public.report_identifications), 'Private results leaked';
end $$;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$ begin
  assert (select count(*) = 2 from public.report_identifications), 'Owner or public results missing';
end $$;
reset role;

update public.reports set visibility = 'private' where id = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
do $$ begin
  assert (select count(*) = 1 from public.report_identifications), 'Visibility change failed';
end $$;
reset role;

set local role service_role;
update public.report_identifications set status = 'failed' where report_id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert public.claim_report_identification('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000002');
end $$;
update public.report_identifications set updated_at = now() - interval '3 minutes'
  where report_id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert public.claim_report_identification('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000004');
end $$;
update public.report_identifications set status = 'failed'
  where report_id = '11111111-1111-1111-1111-111111111111' and attempt_id = '00000000-0000-0000-0000-000000000002';
do $$ begin
  assert (select status = 'processing' from public.report_identifications where report_id = '11111111-1111-1111-1111-111111111111'), 'Stale writer overwrote new attempt';
end $$;
update public.report_identifications set status = 'detected' where report_id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert not public.claim_report_identification('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000005');
end $$;
reset role;
delete from public.reports where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) = 1 from public.report_identifications), 'Delete did not cascade';
end $$;
rollback;
\echo 'Identification access, caching, and retry checks passed.'
