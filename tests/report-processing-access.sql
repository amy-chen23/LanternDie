-- Disposable DB only; transaction + full Supabase fixture, rolled back at end.
\ir fixtures/report-schema.sql
\ir ../supabase/migrations/20261111000000_report_processing_jobs.sql
create temp table leases(tag text,report_id uuid,lease_token uuid,attempts integer);
grant all on leases to authenticated,service_role;

do $$begin
 assert (select count(*)=2 from public.report_processing_jobs), 'Backfill missed existing pending reports';
 assert not has_table_privilege('authenticated','public.report_processing_jobs','UPDATE');
 assert not has_column_privilege('authenticated','public.report_processing_jobs','lease_token','SELECT');
 assert not has_function_privilege('authenticated','public.claim_report_processing_job()','EXECUTE');
 assert not has_function_privilege('anon','public.complete_report_processing(uuid,uuid,jsonb,text,double precision)','EXECUTE');
end$$;
set local role service_role;
insert into leases select 'first',report_id,lease_token,attempts from public.claim_report_processing_job();
insert into leases select 'second',report_id,lease_token,attempts from public.claim_report_processing_job();
do $$begin
 assert (select count(*)=0 from public.claim_report_processing_job()), 'Active lease claimed twice';
 assert (select public.prepare_report_processing(report_id,lease_token,repeat('a',64)) from leases where tag='first');
 assert not (select public.prepare_report_processing(report_id,lease_token,repeat('a',64)) from leases where tag='second'), 'Duplicate accepted';
end$$;
reset role;
do $$begin
 assert (select workflow_status='rejected' from public.reports where id=(select report_id from leases where tag='second'));
 assert (select status='duplicate' from public.report_processing_jobs where report_id=(select report_id from leases where tag='second'));
 assert (select count(*)=0 from public.report_identifications), 'Duplicate invoked detection';
end$$;
update public.report_processing_jobs set lease_until=now()-interval '1 second' where report_id=(select report_id from leases where tag='first');
set local role service_role;
insert into leases select 'reclaimed',report_id,lease_token,attempts from public.claim_report_processing_job();
do $$declare old_job record; current_job record; result jsonb := '{"image_width":100,"image_height":100,"detections":[{"label":"lanternfly","confidence":0.9,"x":1,"y":1,"width":20,"height":20},{"label":"lanternfly","confidence":0.9,"x":30,"y":30,"width":20,"height":20}]}'; begin
 select * into old_job from leases where tag='first';
 select * into current_job from leases where tag='reclaimed';
 assert current_job.attempts=2 and current_job.lease_token<>old_job.lease_token;
 assert public.must_fail(format('select public.prepare_report_processing(%L,%L,%L)',old_job.report_id,old_job.lease_token,repeat('a',64))), 'Stale worker registered hash';
 assert public.must_fail(format('select public.complete_report_processing(%L,%L,%L,''detector/1'',0.5)',old_job.report_id,old_job.lease_token,result)), 'Stale worker committed';
 assert public.must_fail(format('select public.fail_report_processing(%L,%L,''inference_failed'')',old_job.report_id,old_job.lease_token)), 'Stale failure committed';
 assert public.prepare_report_processing(current_job.report_id,current_job.lease_token,repeat('a',64)), 'Retry hash not idempotent';
 perform public.complete_report_processing(current_job.report_id,current_job.lease_token,result,'detector/1',0.5);
end$$;
reset role;
do $$begin
 assert (select count(*)=2 from public.report_insects), 'Boxes not atomically initialized';
 assert (select workflow_status='pending_review' and insects_ready from public.reports where id=(select report_id from leases where tag='first'));
 assert (select count(*)=0 from public.report_kill_credits), 'Detection granted kill credit';
 assert (select status='complete' from public.report_processing_jobs where report_id=(select report_id from leases where tag='first'));
end$$;
-- Job creation is atomic with report insertion; deletion cascades jobs.
insert into public.reports(id,user_id,photo_path) values
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/three.jpg');
set local role service_role;
insert into leases select 'no_detection',report_id,lease_token,attempts from public.claim_report_processing_job();
do $$declare job record; begin
 select * into job from leases where tag='no_detection';
 assert public.must_fail(format('select public.complete_report_processing(%L,%L,''{"image_width":100,"image_height":100,"detections":[]}'',''detector/1'',0.5)',job.report_id,job.lease_token)), 'Hashless job completed';
 perform public.prepare_report_processing(job.report_id,job.lease_token,repeat('c',64));
 perform public.complete_report_processing(job.report_id,job.lease_token,'{"image_width":100,"image_height":100,"detections":[]}','detector/1',0.5);
end$$;
reset role;
do $$begin assert (select workflow_status='admin_review' from public.reports where id='33333333-3333-3333-3333-333333333333'), 'Missed detection not routed to admin'; end$$;
insert into public.reports(id,user_id,photo_path) values
 ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/four.jpg');
set local role service_role;
insert into leases select 'failure',report_id,lease_token,attempts from public.claim_report_processing_job();
select public.prepare_report_processing(report_id,lease_token,repeat('d',64)) from leases where tag='failure';
select public.fail_report_processing(report_id,lease_token,'inference_failed') from leases where tag='failure';
reset role;
do $$begin
 assert (select status='retry' and available_at>now() from public.report_processing_jobs where report_id='44444444-4444-4444-4444-444444444444'), 'No retry backoff';
 assert (select workflow_status='pending_detection' from public.reports where id='44444444-4444-4444-4444-444444444444'), 'Transient failure prematurely escalated';
end$$;
-- Simulate a worker lost on its last allowed inference attempt.
update public.report_processing_jobs set status='running',attempts=5,lease_until=now()-interval '1 second'
 where report_id='44444444-4444-4444-4444-444444444444';
set local role service_role;
insert into leases select 'exhausted',report_id,lease_token,attempts from public.claim_report_processing_job();
select public.fail_report_processing(report_id,lease_token,'worker_exhausted') from leases where tag='exhausted';
reset role;
do $$begin
 assert (select status='failed' from public.report_processing_jobs where report_id='44444444-4444-4444-4444-444444444444');
 assert (select workflow_status='admin_review' from public.reports where id='44444444-4444-4444-4444-444444444444');
end$$;
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select public.touch_member_activity();
do $$begin
 assert (select count(*)=0 from public.report_processing_jobs), 'Reviewer saw owner job status';
 assert public.must_fail($q$select public.retry_report_processing('44444444-4444-4444-4444-444444444444')$q$), 'Foreign retry allowed';
end$$;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$begin
 assert (select count(status)=4 from public.report_processing_jobs), 'Owner statuses missing';
 assert public.must_fail($q$select lease_token from public.report_processing_jobs$q$), 'Lease token leaked';
 assert public.must_fail($q$select public.retry_report_processing('44444444-4444-4444-4444-444444444444')$q$), 'Retry cooldown bypassed';
 assert public.must_fail($q$select public.retry_report_processing('22222222-2222-2222-2222-222222222222')$q$), 'Duplicate requeued';
end$$;
-- Cannot replace or delete the referenced photo after its hash was checked.
delete from storage.objects where name='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/one.jpg';
do $$begin assert (select count(*)=1 from storage.objects), 'Referenced photo deleted'; end$$;
reset role;
update public.report_processing_jobs set updated_at=now()-interval '16 minutes' where report_id='44444444-4444-4444-4444-444444444444';
set local role authenticated;
select public.retry_report_processing('44444444-4444-4444-4444-444444444444');
delete from public.reports where id='44444444-4444-4444-4444-444444444444';
reset role;
do $$begin assert (select count(*)=3 from public.report_processing_jobs), 'Deleted job survived'; end$$;
-- Actual client-column insert also enqueues atomically, with no worker RPC.
set local role authenticated;
insert into public.reports(user_id,photo_path,caption) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/five.jpg','client upload');
do $$begin
 assert (select count(status)=4 from public.report_processing_jobs), 'Client insert failed to enqueue';
 assert public.must_fail($q$insert into public.reports(user_id,photo_path,caption) values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bad.jpg',repeat('x',281))$q$), 'Invalid report accepted';
 assert (select count(status)=4 from public.report_processing_jobs), 'Rolled-back insert left a job';
end$$;
reset role;
insert into public.app_admins(user_id) values('cccccccc-cccc-cccc-cccc-cccccccccccc');
set local role service_role;
insert into leases select 'manual_override',report_id,lease_token,attempts from public.claim_report_processing_job();
select public.prepare_report_processing(report_id,lease_token,repeat('e',64)) from leases where tag='manual_override';
reset role;
set local role authenticated;
set local request.jwt.claim.sub='cccccccc-cccc-cccc-cccc-cccccccccccc';
do $$declare iid uuid; begin
 iid := public.admin_edit_report_insect((select report_id from leases where tag='manual_override'),null,
  '{"x":90,"y":1,"width":5,"height":5}',true,'manual box during processing');
 perform public.admin_decide_report_insect(iid,1,'alive','manual inspection');
end$$;
reset role;
set local role service_role;
select public.complete_report_processing(report_id,lease_token,
 '{"image_width":100,"image_height":100,"detections":[{"x":1,"y":1,"width":20,"height":20}]}','detector/1',0.5)
 from leases where tag='manual_override';
reset role;
do $$begin
 assert (select count(*)=1 from public.report_insects where report_id=(select report_id from leases where tag='manual_override'));
 assert (select label='alive' and box->>'x'='90' from public.report_insects where report_id=(select report_id from leases where tag='manual_override')), 'Worker overwrote manual correction';
end$$;
rollback;
\echo 'Durable upload jobs, leases, hash gate, atomic detections, retries, RLS, and immutable photos passed.'
