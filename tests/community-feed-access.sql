-- Disposable local database only: fixtures, policies, and all data roll back.
\ir fixtures/report-schema.sql
\ir ../supabase/migrations/20261111000000_report_processing_jobs.sql
\ir ../supabase/migrations/20261112000000_community_review.sql
\ir ../supabase/migrations/20261113000000_admin_role_access.sql
\ir ../supabase/migrations/20261114000000_admin_moderation.sql
\ir ../supabase/migrations/20261115000000_admin_attention_unclassified.sql
\ir ../supabase/migrations/20261117000000_community_pending_feed.sql
update public.reports set workflow_status='admin_review' where id='22222222-2222-2222-2222-222222222222';
insert into public.reports(id,user_id,photo_path,workflow_status) values
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/three.jpg','pending_review'),
 ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/rejected.jpg','rejected');
insert into storage.objects values
 ('report-photos','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/two.jpg','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('report-photos','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/three.jpg','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('report-photos','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/rejected.jpg','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('report-photos','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/orphan.jpg','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.report_insects(report_id,box) values
 ('33333333-3333-3333-3333-333333333333','{"x":0,"y":0,"width":10,"height":10}');
insert into public.report_death_assessments(report_id,detector_updated_at,model_sha256,status,scores,threshold,proposed_dead)
 values('33333333-3333-3333-3333-333333333333',now(),'57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d','complete','[0.99]',0.98,true);
insert into public.app_admins(user_id) values('cccccccc-cccc-cccc-cccc-cccccccccccc');
-- A signed-in inactive member can browse all pending stages, but cannot review.
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$ begin
 assert (select count(*)=3 from public.reports), 'Pending uploads missing or rejected upload exposed';
 assert (select count(*)=3 from storage.objects), 'Photos did not match feed visibility or orphan exposed';
 assert (select count(*)=1 from public.report_insects), 'Visible insect boxes inaccessible';
 assert (select count(*)=0 from public.report_death_assessments), 'Owner-only model scores leaked';
 assert (select count(*)=0 from public.report_kill_credits), 'Pending visibility awarded kill credit';
 assert public.must_fail($q$select public.claim_report_review('33333333-3333-3333-3333-333333333333')$q$), 'Inactive member gained review access';
 assert public.must_fail($q$update public.reports set workflow_status='published' where id='33333333-3333-3333-3333-333333333333'$q$), 'Client could approve a pending post';
 assert public.must_fail($q$insert into public.report_votes(report_id,voter_id,value) values('33333333-3333-3333-3333-333333333333',auth.uid(),1)$q$), 'Pending social vote accepted';
end $$;
select public.touch_member_activity();
do $$ begin
 assert exists(select 1 from public.claim_report_review('33333333-3333-3333-3333-333333333333')), 'Eligible member could not review visible pending report';
end $$;
-- Rejection immediately removes a sighting and its photo from other members.
reset role;
update public.reports set workflow_status='rejected' where id='33333333-3333-3333-3333-333333333333';
set local role authenticated;
do $$ begin
 assert (select count(*)=2 from public.reports), 'Rejected report remained in feed';
 assert (select count(*)=2 from storage.objects), 'Rejected photo remained accessible';
end $$;
-- Owners/admins retain moderation access, and the uploader still cannot self-review.
set local request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$ begin
 assert (select count(*)=4 from public.reports), 'Owner lost access to rejected submissions';
 assert public.must_fail($q$select public.claim_report_review('11111111-1111-1111-1111-111111111111')$q$), 'Uploader allowed to self-review';
end $$;
set local request.jwt.claim.sub='cccccccc-cccc-cccc-cccc-cccccccccccc';
do $$ begin assert (select count(*)=4 from public.reports), 'Admin lost moderation access'; end $$;
reset role;
do $$ begin assert not has_table_privilege('anon','public.reports','SELECT'), 'Anonymous feed access was introduced'; end $$;
rollback;
\echo 'Pending feed visibility, photos, rejection, review eligibility, score privacy and credit boundaries passed.'
