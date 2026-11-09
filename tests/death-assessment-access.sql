-- Disposable database only; fixtures and roles roll back.
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema private;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
 $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create table public.reports (id uuid primary key, user_id uuid not null, visibility text not null,
 photo_path text not null default 'test.jpg', created_at timestamptz not null default now());
alter table public.reports enable row level security;
grant select on public.reports to authenticated;
create policy visible on public.reports for select to authenticated
 using (user_id = (select auth.uid()) or visibility = 'public');
\ir ../supabase/migrations/20261019180000_report_identification.sql
\ir ../supabase/migrations/20261107000000_death_assessments.sql

create function public.must_fail(command text) returns boolean language plpgsql as $$
begin execute command; return false; exception when others then return true; end; $$;
grant execute on function public.must_fail(text) to authenticated;
insert into auth.users values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.reports (id,user_id,visibility) values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','public'),
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','private'),
 ('33333333-3333-3333-3333-333333333333','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','public');
insert into public.report_identifications (report_id,status,attempt_id,updated_at,detections) values
 ('11111111-1111-1111-1111-111111111111','detected','00000000-0000-0000-0000-000000000001','2026-11-07T12:00:00Z','[{"x":0},{"x":1}]'),
 ('22222222-2222-2222-2222-222222222222','detected','00000000-0000-0000-0000-000000000002','2026-11-07T12:00:00Z','[{"x":0}]'),
 ('33333333-3333-3333-3333-333333333333','not_detected','00000000-0000-0000-0000-000000000003','2026-11-07T12:00:00Z','[]');

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select public.save_death_assessment('11111111-1111-1111-1111-111111111111','2026-11-07T12:00:00Z',
 '57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d','complete','[0.99,0.4]');
do $$ begin
 assert (select route = 'community_verification' and not proposed_dead from public.report_death_assessments);
 assert public.must_fail($q$select public.save_death_assessment('11111111-1111-1111-1111-111111111111','2026-11-07T12:00:01Z','57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d','complete','[0.99,0.4]')$q$), 'Stale gate accepted';
 assert public.must_fail($q$select public.save_death_assessment('11111111-1111-1111-1111-111111111111','2026-11-07T12:00:00Z','57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d','complete','[0.99]')$q$), 'Missing box accepted';
 assert public.must_fail($q$select public.save_death_assessment('11111111-1111-1111-1111-111111111111','2026-11-07T12:00:00Z','57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d','complete','[null,2]')$q$), 'Invalid scores accepted';
 assert public.must_fail($q$select public.set_verification_vote('11111111-1111-1111-1111-111111111111','2026-11-07T12:00:00Z',0,'dead')$q$), 'Self vote accepted';
 assert not has_table_privilege('authenticated','public.report_death_assessments','UPDATE');
 assert not has_table_privilege('authenticated','public.death_training_candidates','SELECT');
 assert not has_table_privilege('authenticated','public.death_training_reviews','INSERT');
 assert not has_function_privilege('anon','public.save_death_assessment(uuid,timestamptz,text,text,jsonb,text)','EXECUTE');
end; $$;
-- A completed snapshot cannot be silently rewritten.
select public.save_death_assessment('11111111-1111-1111-1111-111111111111','2026-11-07T12:00:00Z',
 '57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d','complete','[0.99,0.99]');
do $$ begin assert (select scores = '[0.99,0.4]'::jsonb from public.report_death_assessments); end; $$;
select public.save_death_assessment('22222222-2222-2222-2222-222222222222','2026-11-07T12:00:00Z',
 '57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d','unavailable','[]','native_build_required');
select public.save_death_assessment('22222222-2222-2222-2222-222222222222','2026-11-07T12:00:00Z',
 '57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d','complete','[0.99]');
do $$ begin assert (select status = 'complete' and proposed_dead and route = 'community_verification'
 from public.report_death_assessments where report_id = '22222222-2222-2222-2222-222222222222'); end; $$;

set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$ begin
 assert (select count(*) = 0 from public.report_death_assessments), 'Other device scores leaked';
 assert (select count(*) = 1 from public.report_verification_queue), 'Gate or privacy filter failed';
 assert public.must_fail($q$select public.save_death_assessment('11111111-1111-1111-1111-111111111111','2026-11-07T12:00:00Z','57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d','complete','[0.99,0.99]')$q$), 'Foreign assessment accepted';
 assert public.must_fail($q$select public.save_death_assessment('33333333-3333-3333-3333-333333333333','2026-11-07T12:00:00Z','57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d','complete','[]')$q$), 'No detection passed the gate';
 assert public.must_fail($q$select public.set_verification_vote('22222222-2222-2222-2222-222222222222','2026-11-07T12:00:00Z',0,'dead')$q$), 'Private vote accepted';
 assert public.must_fail($q$select public.set_verification_vote('11111111-1111-1111-1111-111111111111','2026-11-07T12:00:00Z',2,'dead')$q$), 'Out-of-range box accepted';
 assert public.must_fail($q$select public.set_verification_vote('11111111-1111-1111-1111-111111111111','2026-11-08T12:00:00Z',0,'dead')$q$), 'Stale vote accepted';
end; $$;
select public.set_verification_vote('11111111-1111-1111-1111-111111111111','2026-11-07T12:00:00Z',0,'dead');
select public.set_verification_vote('11111111-1111-1111-1111-111111111111','2026-11-07T12:00:00Z',1,'uncertain');
do $$ begin assert (select count(*) = 0 from public.report_verification_queue), 'Finished report remains queued'; end; $$;
select public.set_verification_vote('11111111-1111-1111-1111-111111111111','2026-11-07T12:00:00Z',1,'alive');
do $$ begin assert (select count(*) = 2 from public.report_verification_votes); end; $$;
select public.set_verification_vote('11111111-1111-1111-1111-111111111111','2026-11-07T12:00:00Z',1,null);
do $$ begin assert (select count(*) = 1 from public.report_verification_queue), 'Removing vote did not requeue'; end; $$;
reset role;
set local role service_role;
do $$ begin assert (select dead_votes = 1 from public.death_training_candidates); end; $$;
reset role;
insert into public.death_training_reviews (report_id,detector_updated_at,detection_index,label,specimen_group,dataset_split,reviewed_by)
 values ('11111111-1111-1111-1111-111111111111','2026-11-07T12:00:00Z',0,'dead','same-insect','train','reviewer');
do $$ begin
 assert public.must_fail($q$insert into public.death_training_reviews (report_id,detector_updated_at,detection_index,label,specimen_group,dataset_split,reviewed_by) values ('11111111-1111-1111-1111-111111111111','2026-11-07T12:00:00Z',1,'alive','same-insect','test','reviewer')$q$), 'Specimen leaked across dataset splits';
 assert (select count(*) = 1 from public.death_reviewed_training_examples);
end; $$;
update public.reports set visibility = 'private' where id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
do $$ begin
 assert (select count(*) = 0 from public.report_verification_queue), 'Private report leaked into queue';
 assert (select count(*) = 0 from public.report_verification_votes), 'Votes visible after privatizing';
end; $$;
reset role;
do $$ begin assert (select count(*) = 0 from public.death_training_candidates), 'Private training candidates leaked'; end; $$;
do $$ begin assert (select count(*) = 0 from public.death_reviewed_training_examples), 'Private reviewed examples leaked'; end; $$;
rollback;
\echo 'Death gate, shadow storage, voting, queue, and privacy checks passed.'
