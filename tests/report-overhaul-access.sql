-- Full schema and transaction fixture shared with the pipeline tests.
\ir fixtures/report-schema.sql
insert into public.app_admins values('cccccccc-cccc-cccc-cccc-cccccccccccc',now());

do $$begin
 assert (select bool_and(visibility = 'public' and workflow_status = 'pending_detection' and published_at is null) from public.reports), 'Legacy reports not reset';
 assert (select count(*) = 0 from public.report_kill_credits), 'Legacy uploads earned credit';
 assert not has_table_privilege('authenticated','public.app_admins','INSERT');
 assert not has_table_privilege('authenticated','public.report_insects','UPDATE');
 assert not has_column_privilege('authenticated','public.reports','workflow_status','UPDATE');
 assert not has_column_privilege('authenticated','public.reports','insects_ready','UPDATE');
 assert not has_table_privilege('authenticated','public.report_kill_credits','INSERT');
 assert not has_table_privilege('service_role','public.report_insects','UPDATE');
 assert not has_table_privilege('service_role','public.report_kill_credits','UPDATE');
 assert not has_table_privilege('anon','public.report_insects','SELECT');
 assert not has_table_privilege('service_role','public.report_audit_log','DELETE');
 assert not has_table_privilege('service_role','public.report_photo_hashes','DELETE');
 assert not has_function_privilege('authenticated','public.register_report_photo_hash(uuid,text)','EXECUTE');
 assert not has_function_privilege('anon','public.admin_decide_report_insect(uuid,integer,text,text)','EXECUTE');
end$$;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin
 assert (select count(*) = 0 from public.reports), 'Pending reports leaked to inactive member';
 assert (select count(*) = 0 from storage.objects), 'Pending images leaked';
 assert (select count(*) = 0 from public.get_raw_upload_leaderboard('weekly')), 'Raw uploads counted';
 assert public.must_fail($q$select public.admin_reject_report('11111111-1111-1111-1111-111111111111','fake admin')$q$), 'Non-admin override allowed';
 assert public.must_fail($q$insert into public.app_admins(user_id) values('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$q$), 'Self promotion allowed';
end$$;
select public.touch_member_activity();
reset role;
-- Model device shadow data does not seed authoritative insect state.
insert into public.report_identifications(report_id,status,attempt_id,image_width,image_height,detections,updated_at) values
 ('11111111-1111-1111-1111-111111111111','detected',gen_random_uuid(),100,100,
 '[{"x":1,"y":1,"width":20,"height":20},{"x":30,"y":30,"width":20,"height":20}]','2026-11-09T12:00:00Z');
set local role service_role;
select public.initialize_report_insects('11111111-1111-1111-1111-111111111111','2026-11-09T12:00:00Z');
do $$begin
 assert public.must_fail($q$select public.initialize_report_insects('11111111-1111-1111-1111-111111111111','2026-11-09T12:00:00Z')$q$), 'Detector rerun overwrote boxes';
 assert public.must_fail($q$select public.record_report_insect_decision((select id from public.report_insects limit 1),1,'dead','model','unvalidated','57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d',0.999)$q$), 'Unvalidated model approved insects';
end$$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin
 assert (select count(*) = 1 from public.report_verification_queue), 'Active reviewer cannot see pending queue';
 assert (select count(*) = 1 from storage.objects), 'Reviewer cannot see review image';
 assert public.must_fail($q$insert into public.report_votes(report_id,voter_id,value) values('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',1)$q$), 'Pending social vote accepted';
 assert (select count(*) = 0 from public.report_audit_log), 'Audit leaked to reviewer';
end$$;
reset role;
update public.member_activity set last_seen_at = now() - interval '15 days' where user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
set local role authenticated;
do $$begin assert (select count(*) = 0 from public.report_verification_queue), 'Inactive reviewer retained access'; end$$;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$begin
 assert (select count(*) = 2 from public.reports), 'Uploader cannot see own pending reports';
 assert (select count(*) = 0 from public.report_verification_queue), 'Self review allowed';
 assert public.must_fail($q$update public.reports set workflow_status='published'$q$), 'Uploader can publish';
end$$;
reset role;
-- Hash is global, immutable, idempotent for same report, and required for publication.
set local role service_role;
select public.register_report_photo_hash('11111111-1111-1111-1111-111111111111',repeat('a',64));
select public.register_report_photo_hash('11111111-1111-1111-1111-111111111111',repeat('a',64));
do $$begin
 assert public.must_fail($q$select public.register_report_photo_hash('22222222-2222-2222-2222-222222222222',repeat('a',64))$q$), 'Cross-report duplicate allowed';
 assert public.must_fail($q$select public.register_report_photo_hash('11111111-1111-1111-1111-111111111111',repeat('b',64))$q$), 'Hash replacement allowed';
end$$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
do $$declare ids uuid[]; begin
 select array_agg(id order by (box->>'x')::int) into ids from public.report_insects;
 perform public.admin_decide_report_insect(ids[1],1,'dead','clear evidence');
 assert (select workflow_status = 'pending_review' from public.reports where id='11111111-1111-1111-1111-111111111111'), 'Partial report published';
 assert (select count(*) = 0 from public.report_kill_credits), 'Partial report earned credit';
 perform public.admin_decide_report_insect(ids[2],1,'alive','clear evidence');
 assert (select workflow_status='published' from public.reports where id='11111111-1111-1111-1111-111111111111');
 assert (select dead_insects=1 from public.report_kill_credits);
 assert (select verified_kills=1 from public.get_raw_upload_leaderboard('weekly'));
 -- Reverse a final decision and credit recalculates immediately.
 perform public.admin_decide_report_insect(ids[2],1,'dead','corrected decision');
 assert (select dead_insects=2 from public.report_kill_credits);
 -- Corrections preserve publication and the committed count until re-finalized.
 perform public.admin_edit_report_insect('11111111-1111-1111-1111-111111111111',ids[1],'{"x":2,"y":1,"width":20,"height":20}',true,'correct box');
 assert (select workflow_status='published' from public.reports where id='11111111-1111-1111-1111-111111111111');
 assert (select dead_insects=2 from public.report_kill_credits);
 perform set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
 perform public.touch_member_activity();
 assert (select count(*)=1 from public.report_verification_queue), 'Published correction missing from queue';
 perform set_config('request.jwt.claim.sub','cccccccc-cccc-cccc-cccc-cccccccccccc',true);
 assert (select review_started_at=now() from public.reports where id='11111111-1111-1111-1111-111111111111'), 'Correction timer not reset';
 assert public.must_fail(format('select public.admin_decide_report_insect(%L,1,''dead'',''stale'')',ids[1])), 'Stale decision accepted';
 perform public.admin_decide_report_insect(ids[1],2,'alive','corrected insect');
 assert (select dead_insects=1 from public.report_kill_credits);
 assert (select count(*)>0 from public.report_audit_log where action='admin_box_edit');
end$$;
reset role;
set local role service_role;
set local request.jwt.claim.sub = '';
do $$begin
 assert public.must_fail($q$select public.record_report_insect_decision((select id from public.report_insects where label='dead' limit 1),1,'alive','community','override')$q$), 'Worker overrode admin';
end$$;
reset role;
-- All-alive admin case: no detections can still be corrected, but not published
-- without the hash, explicit completed box set, and final decisions.
insert into public.report_identifications(report_id,status,attempt_id) values
 ('22222222-2222-2222-2222-222222222222','not_detected',gen_random_uuid());
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
do $$declare iid uuid; begin
 assert (select count(*)=1 from public.report_admin_queue), 'No detection not escalated';
 iid := public.admin_edit_report_insect('22222222-2222-2222-2222-222222222222',null,'{"x":1,"y":1,"width":5,"height":5}',true,'missed bug');
 perform public.admin_decide_report_insect(iid,1,'alive','live insect');
 assert public.must_fail($q$select public.admin_publish_report('22222222-2222-2222-2222-222222222222','publish')$q$), 'Hashless report published';
end$$;
reset role;
set local role service_role;
select public.register_report_photo_hash('22222222-2222-2222-2222-222222222222',repeat('b',64));
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select public.admin_publish_report('22222222-2222-2222-2222-222222222222','publish corrected sighting');
do $$begin
 assert (select workflow_status='published' from public.reports where id='22222222-2222-2222-2222-222222222222');
 assert (select dead_insects=0 from public.report_kill_credits where report_id='22222222-2222-2222-2222-222222222222'), 'Alive sighting earned credit';
 assert public.must_fail($q$select model_score from public.report_insects$q$), 'Machine score leaked';
end$$;
select public.admin_reject_report('11111111-1111-1111-1111-111111111111','invalid report');
do $$begin
 assert (select count(*)=0 from public.get_raw_upload_leaderboard('monthly')), 'Rejected credit remained';
 assert (select count(*)=0 from public.report_kill_credits where report_id='11111111-1111-1111-1111-111111111111');
end$$;
select public.admin_publish_report('11111111-1111-1111-1111-111111111111','admin restores reviewed report');
reset role;
-- Escalation based on review age, not upload age.
insert into public.reports(id,user_id,photo_path,workflow_status,review_started_at) values
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/three.jpg','pending_review',now()-interval '49 hours');
insert into public.report_insects(report_id,box) values('33333333-3333-3333-3333-333333333333','{"x":1,"y":1,"width":5,"height":5}');
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
do $$begin assert (select count(*)=1 from public.report_admin_queue), '48-hour escalation missing'; end$$;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.reports where id='11111111-1111-1111-1111-111111111111';
reset role;
do $$begin
 assert (select count(*)=0 from public.report_kill_credits where report_id='11111111-1111-1111-1111-111111111111'), 'Deleted report credit remained';
 assert (select report_id is null from public.report_photo_hashes where sha256=repeat('a',64)), 'Deleted hash missing';
 assert (select count(*)>0 from public.report_audit_log where report_id='11111111-1111-1111-1111-111111111111'), 'Audit was deleted';
end$$;
set local role service_role;
do $$begin
 assert public.must_fail($q$select public.register_report_photo_hash('33333333-3333-3333-3333-333333333333',repeat('a',64))$q$), 'Deleted image reupload allowed';
end$$;
reset role;
-- A trusted consensus decision can complete a box, but publication waits for hash.
set local role service_role;
do $$declare iid uuid; begin
 select id into iid from public.report_insects where report_id='33333333-3333-3333-3333-333333333333';
 assert public.must_fail(format('select public.record_report_insect_decision(%L,99,''dead'',''community'',''quorum'')',iid)), 'Stale revision accepted';
 perform public.record_report_insect_decision(iid,1,'dead','community','trusted quorum worker');
 assert public.must_fail(format('select public.record_report_insect_decision(%L,1,''alive'',''community'',''rewrite'')',iid)), 'Final decision rewritten by worker';
end$$;
reset role;
do $$begin
 assert (select workflow_status='pending_review' from public.reports where id='33333333-3333-3333-3333-333333333333'), 'Hashless report published';
end$$;
-- Seal the completed set (normally initialize_report_insects does this).
update public.reports set insects_ready=true where id='33333333-3333-3333-3333-333333333333';
set local role service_role;
select public.register_report_photo_hash('33333333-3333-3333-3333-333333333333',repeat('c',64));
reset role;
do $$begin
 assert (select dead_insects=1 from public.report_kill_credits where report_id='33333333-3333-3333-3333-333333333333'), 'Late hash did not reconcile credit';
end$$;
-- Account deletion removes credit but preserves audit and global hash tombstones.
delete from auth.users where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$begin
 assert (select count(*)=0 from public.report_kill_credits), 'Deleted account retained credit';
 assert (select count(*)=3 from public.report_photo_hashes where report_id is null), 'Account deletion lost hash tombstones';
 assert (select count(*)>0 from public.report_audit_log), 'Account deletion lost audit';
end$$;
rollback;
\echo 'Report overhaul: migration, RLS, hashing, admin decisions, credits, corrections, escalation and deletion passed.'
