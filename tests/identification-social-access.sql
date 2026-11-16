-- Disposable database only; no hosted data. Includes existing historical credits.
\ir fixtures/report-schema.sql
\ir ../supabase/migrations/20261111000000_report_processing_jobs.sql
\ir ../supabase/migrations/20261112000000_community_review.sql
\ir ../supabase/migrations/20261113000000_admin_role_access.sql
\ir ../supabase/migrations/20261113183923_report_author_votes.sql
\ir ../supabase/migrations/20261114000000_admin_moderation.sql
\ir ../supabase/migrations/20261114231144_community_vote_summary.sql
\ir ../supabase/migrations/20261115000000_admin_attention_unclassified.sql

insert into public.report_identifications(report_id,status,attempt_id,image_width,image_height,detections,updated_at)
 select id,'detected',gen_random_uuid(),100,100,'[{"x":1,"y":1,"width":20,"height":20}]',now()
 from public.reports;
select public.register_report_photo_hash('11111111-1111-1111-1111-111111111111',repeat('a',64));
select public.register_report_photo_hash('22222222-2222-2222-2222-222222222222',repeat('b',64));
select public.initialize_report_insects(report_id,updated_at) from public.report_identifications;
update public.report_insects set label='dead',decision_source='admin',decided_at=now(),reason='Historical confirmed decision'
 where report_id='11111111-1111-1111-1111-111111111111';
create temp table credit_before as select * from public.report_kill_credits;
grant select on credit_before to authenticated,service_role;

\ir ../supabase/migrations/20261119000000_identification_social_only.sql

do $$begin
 assert (select count(*)=2 from public.reports where workflow_status='published'), 'Detected pending report did not publish';
 assert (select label='pending' from public.report_insects where report_id='22222222-2222-2222-2222-222222222222'), 'Detection invented a life-status label';
 assert (select jsonb_agg(to_jsonb(c)) from public.report_kill_credits c)=(select jsonb_agg(to_jsonb(c)) from credit_before c), 'Migration changed historical points';
 assert not has_function_privilege('authenticated','public.set_insect_review_vote(uuid,integer,text)','EXECUTE');
 assert not has_function_privilege('authenticated','public.get_report_vote_summary(uuid)','EXECUTE');
 assert not has_function_privilege('authenticated','public.admin_moderate_report(uuid,text,text,text,uuid,integer,jsonb,integer,integer)','EXECUTE');
 assert not has_function_privilege('authenticated','public.admin_decide_report_insect(uuid,integer,text,text)','EXECUTE');
 assert not has_function_privilege('service_role','public.record_report_insect_decision(uuid,integer,text,text,text,text,double precision)','EXECUTE');
end$$;

set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin
 assert (select count(*)=0 from public.report_verification_queue);
 assert (select count(*)=0 from public.report_admin_queue);
 assert public.must_fail($q$select * from public.claim_report_review('22222222-2222-2222-2222-222222222222')$q$);
 assert public.must_fail($q$insert into public.report_votes(report_id,voter_id,value) values('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',-1)$q$), 'Forged vote accepted';
 assert public.must_fail($q$update public.report_insects set label='dead'$q$), 'Social voter can decide dead';
end$$;
insert into public.report_votes(report_id,voter_id,value) values('22222222-2222-2222-2222-222222222222',auth.uid(),1);
do $$begin
 assert (select upvotes=2 and downvotes=0 from public.reports where id='22222222-2222-2222-2222-222222222222');
 assert public.must_fail($q$insert into public.report_votes(report_id,voter_id,value) values('22222222-2222-2222-2222-222222222222',auth.uid(),1)$q$), 'Duplicate vote accepted';
end$$;
update public.report_votes set value=-1 where report_id='22222222-2222-2222-2222-222222222222' and voter_id=auth.uid();
do $$begin
 assert (select upvotes=1 and downvotes=1 from public.reports where id='22222222-2222-2222-2222-222222222222');
end$$;
delete from public.report_votes where report_id='22222222-2222-2222-2222-222222222222' and voter_id=auth.uid();
do $$begin
 assert (select upvotes=1 and downvotes=0 from public.reports where id='22222222-2222-2222-2222-222222222222');
end$$;
-- Author may switch/remove/re-add the automatically seeded SOCIAL vote.
set local request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.report_votes set value=-1 where report_id='22222222-2222-2222-2222-222222222222' and voter_id=auth.uid();
delete from public.report_votes where report_id='22222222-2222-2222-2222-222222222222' and voter_id=auth.uid();
insert into public.report_votes(report_id,voter_id,value) values('22222222-2222-2222-2222-222222222222',auth.uid(),1);
reset role;
do $$begin
 assert (select jsonb_agg(to_jsonb(c)) from public.report_kill_credits c)=(select jsonb_agg(to_jsonb(c)) from credit_before c), 'Social votes changed points';
 assert (select label='pending' from public.report_insects where report_id='22222222-2222-2222-2222-222222222222');
end$$;

update public.report_processing_jobs set status='complete';
insert into public.reports(id,user_id,photo_path) values
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/new.jpg');
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin
 assert not exists(select 1 from public.reports where id='33333333-3333-3333-3333-333333333333'), 'Pre-detection image exposed';
 assert public.must_fail($q$insert into public.report_votes(report_id,voter_id,value) values('33333333-3333-3333-3333-333333333333',auth.uid(),1)$q$);
end$$;
reset role;
set local role service_role;
do $$declare job record; begin
 select * into job from public.claim_report_processing_job();
 assert job.report_id='33333333-3333-3333-3333-333333333333';
 assert public.prepare_report_processing(job.report_id,job.lease_token,repeat('c',64));
 perform public.complete_report_processing(job.report_id,job.lease_token,
  '{"image_width":100,"image_height":100,"detections":[{"x":1,"y":1,"width":20,"height":20},{"x":40,"y":40,"width":20,"height":20}]}','detector/1',0.5);
 assert (select workflow_status='published' and insects_ready from public.reports where id=job.report_id);
 assert (select count(*)=2 and bool_and(label='pending') from public.report_insects where report_id=job.report_id);
 assert not exists(select 1 from public.report_kill_credits where report_id=job.report_id), 'Detection granted points';
end$$;
reset role;

insert into public.reports(id,user_id,photo_path) values
 ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/empty.jpg');
set local role service_role;
do $$declare job record; begin
 select * into job from public.claim_report_processing_job();
 assert public.prepare_report_processing(job.report_id,job.lease_token,repeat('d',64));
 perform public.complete_report_processing(job.report_id,job.lease_token,'{"image_width":100,"image_height":100,"detections":[]}','detector/1',0.5);
 assert (select workflow_status='rejected' from public.reports where id=job.report_id), 'Empty detection requests human review';
end$$;
reset role;
insert into public.reports(id,user_id,photo_path) values
 ('55555555-5555-5555-5555-555555555555','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/duplicate.jpg');
set local role service_role;
do $$declare job record; begin
 select * into job from public.claim_report_processing_job();
 assert not public.prepare_report_processing(job.report_id,job.lease_token,repeat('c',64));
 assert (select workflow_status='rejected' from public.reports where id=job.report_id);
end$$;
reset role;
insert into public.reports(id,user_id,photo_path) values
 ('66666666-6666-6666-6666-666666666666','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/failed.jpg');
set local role service_role;
do $$declare job record; begin
 select * into job from public.claim_report_processing_job();
 perform public.fail_report_processing(job.report_id,job.lease_token,'configuration');
 assert (select workflow_status='pending_detection' from public.reports where id=job.report_id);
 assert (select status='failed' from public.report_processing_jobs where report_id=job.report_id);
end$$;
reset role;
update public.report_processing_jobs set updated_at=now()-interval '16 minutes' where report_id='66666666-6666-6666-6666-666666666666';
set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select public.retry_report_processing('66666666-6666-6666-6666-666666666666');
reset role;
do $$begin
 assert not exists(select 1 from public.reports where workflow_status in ('admin_review','pending_review'));
 assert (select count(*)=1 and sum(dead_insects)=1 from public.report_kill_credits), 'New flow granted points or lost history';
end$$;
rollback;
