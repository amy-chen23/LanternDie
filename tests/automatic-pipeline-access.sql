\ir fixtures/report-schema.sql
\ir ../supabase/migrations/20261111000000_report_processing_jobs.sql
-- Fake pg_net and Vault exercise dispatch without making network requests.
create schema net;
create schema vault;
create table vault.decrypted_secrets(name text,decrypted_secret text);
insert into vault.decrypted_secrets values ('project_url','https://example.supabase.co'),('report_worker_secret',repeat('x',32));
create table net.requests(url text,body jsonb);
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint
language plpgsql as $$begin insert into net.requests values(url,body); return 1; end; $$;
\ir ../supabase/migrations/20261116000000_automatic_model_pipeline.sql
insert into public.reports(id,user_id,photo_path) values
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/auto.jpg');
do $$begin
 assert (select count(*)=1 from net.requests), 'Upload did not automatically dispatch';
 assert (select body->>'report_id'='33333333-3333-3333-3333-333333333333' from net.requests);
 assert not has_column_privilege('authenticated','public.report_processing_jobs','detection_checkpoint','SELECT');
 assert not has_function_privilege('authenticated','public.claim_report_pipeline_job(uuid)','EXECUTE');
 assert not has_function_privilege('authenticated','public.complete_report_pipeline(uuid,uuid,jsonb,text,double precision,jsonb)','EXECUTE');
end$$;
create temp table leased as select * from public.claim_report_pipeline_job('33333333-3333-3333-3333-333333333333');
grant select on leased to service_role;
set local role service_role;
do $$declare j record; result jsonb := '{"image_width":100,"image_height":80,"detections":[{"x":1,"y":2,"width":10,"height":10,"label":"lanternfly","confidence":0.9}]}'; begin
 select * into j from leased;
 assert j.report_id='33333333-3333-3333-3333-333333333333';
 perform public.prepare_report_processing(j.report_id,j.lease_token,repeat('c',64));
 perform public.checkpoint_report_detection(j.report_id,j.lease_token,jsonb_build_object('result',result,'model','test/1','threshold',0.5));
 assert public.must_fail(format('select public.complete_report_pipeline(%L,%L,%L,''test/1'',0.5,null)',j.report_id,j.lease_token,result)), 'Detection-only completion accepted';
 assert (select status='running' and stage='classification' from public.report_processing_jobs where report_id=j.report_id);
 perform public.complete_report_pipeline(j.report_id,j.lease_token,result,'test/1',0.5,
  '{"model_sha256":"57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d","preprocessing_version":"padded-rgb-pillow-bilinear-v1","scores":[0.99]}');
 assert (select status='complete' from public.report_processing_jobs where report_id=j.report_id);
 assert (select scores='[0.99]'::jsonb from public.report_model_assessments where report_id=j.report_id);
 assert not exists(select 1 from public.report_kill_credits where report_id=j.report_id), 'Shadow score awarded credit';
 assert (select label='pending' from public.report_insects where report_id=j.report_id), 'Shadow score finalized insect';
end$$;
reset role;
-- A retry claims the existing detector snapshot rather than discarding progress.
insert into public.reports(id,user_id,photo_path) values
 ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/retry.jpg');
do $$declare j record; recovered record; checkpoint jsonb := '{"result":{"image_width":100,"image_height":80,"detections":[{"x":1,"y":2,"width":10,"height":10}]},"model":"test/1","threshold":0.5}'; begin
 select * into j from public.claim_report_pipeline_job('44444444-4444-4444-4444-444444444444');
 perform public.prepare_report_processing(j.report_id,j.lease_token,repeat('d',64));
 perform public.checkpoint_report_detection(j.report_id,j.lease_token,checkpoint);
 perform public.fail_report_processing(j.report_id,j.lease_token,'inference_failed');
 update public.report_processing_jobs set available_at=now() where report_id=j.report_id;
 select * into recovered from public.claim_report_pipeline_job(j.report_id);
 assert recovered.detection_checkpoint=checkpoint, 'Retry lost detector progress';
 assert recovered.lease_token<>j.lease_token, 'Retry reused stale lease';
 assert public.must_fail(format('select public.checkpoint_report_detection(%L,%L,%L)',j.report_id,j.lease_token,checkpoint)), 'Stale detector checkpoint accepted';
end$$;
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin assert (select count(*)=0 from public.report_model_assessments), 'Machine scores leaked to reviewer'; end$$;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$begin assert (select count(*)=1 from public.report_model_assessments), 'Owner score missing'; end$$;
reset role;
rollback;
