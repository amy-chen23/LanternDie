-- Disposable DB only. All migrations and fixtures roll back.
\ir fixtures/report-schema.sql
\ir ../supabase/migrations/20261111000000_report_processing_jobs.sql
\ir ../supabase/migrations/20261112000000_community_review.sql
insert into auth.users(id) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6) n;
insert into public.member_activity(user_id) select id from auth.users;
insert into public.app_admins(user_id) values('cccccccc-cccc-cccc-cccc-cccccccccccc');
insert into public.report_identifications(report_id,status,attempt_id,image_width,image_height,detections,updated_at) values
 ('11111111-1111-1111-1111-111111111111','detected',gen_random_uuid(),100,100,
 '[{"x":1,"y":1,"width":20,"height":20},{"x":30,"y":30,"width":20,"height":20}]','2026-11-09T12:00:00Z'),
 ('22222222-2222-2222-2222-222222222222','detected',gen_random_uuid(),100,100,
 '[{"x":1,"y":1,"width":20,"height":20}]','2026-11-09T12:00:00Z');
select public.register_report_photo_hash('11111111-1111-1111-1111-111111111111',repeat('a',64));
select public.register_report_photo_hash('22222222-2222-2222-2222-222222222222',repeat('b',64));
select public.initialize_report_insects('11111111-1111-1111-1111-111111111111','2026-11-09T12:00:00Z');
select public.initialize_report_insects('22222222-2222-2222-2222-222222222222','2026-11-09T12:00:00Z');
create temp table targets(name text primary key,id uuid);
insert into targets select case when (box->>'x')::int=1 then 'a' else 'b' end,id from public.report_insects where report_id='11111111-1111-1111-1111-111111111111';
insert into targets select 'expiry',id from public.report_insects where report_id='22222222-2222-2222-2222-222222222222';
grant select on targets to authenticated,service_role;
-- Pending machine evidence is hidden until the member submits their own label.
update public.report_insects set model_score=0.4 where id=(select id from targets where name='a');

do $$begin
 assert not has_table_privilege('authenticated','public.insect_review_votes','INSERT');
 assert not has_table_privilege('authenticated','public.insect_review_votes','UPDATE');
 assert not has_table_privilege('authenticated','public.insect_review_claims','SELECT');
 assert not has_function_privilege('anon','public.set_insect_review_vote(uuid,integer,text)','EXECUTE');
end$$;
set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$begin
 assert public.must_fail($q$select public.claim_report_review('11111111-1111-1111-1111-111111111111')$q$), 'Self claim allowed';
end$$;
-- Five reviewers may reserve seats; the sixth cannot join a full panel.
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select * from public.claim_report_review('11111111-1111-1111-1111-111111111111');
do $$begin
 assert (select bool_and(can_vote and feedback is null and my_vote is null) from public.get_report_review('11111111-1111-1111-1111-111111111111')), 'Pre-vote feedback leaked';
 assert public.must_fail(format('select public.get_insect_review_feedback(%L,1)',(select id from targets where name='a'))), 'Pre-vote tally leaked';
end$$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select * from public.claim_report_review('11111111-1111-1111-1111-111111111111');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select * from public.claim_report_review('11111111-1111-1111-1111-111111111111');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select * from public.claim_report_review('11111111-1111-1111-1111-111111111111');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select * from public.claim_report_review('11111111-1111-1111-1111-111111111111');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
do $$begin
 assert (select bool_and(not can_vote) from public.claim_report_review('11111111-1111-1111-1111-111111111111')), 'Sixth seat granted';
 assert public.must_fail(format('select public.set_insect_review_vote(%L,1,''dead'')',(select id from targets where name='a'))), 'Unclaimed vote allowed';
end$$;
-- An uncertain vote releases a seat without counting toward either decision.
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select public.set_insect_review_vote(id,1,'dead') from targets where name='a';
select public.set_insect_review_vote(id,1,'uncertain') from targets where name='b';
do $$begin
 assert (select count(*)=2 from public.insect_review_votes), 'Own labels missing';
 assert (select dead_votes=1 and model_score=0.4 from public.get_insect_review_feedback((select id from targets where name='a'),1)), 'Post-vote feedback missing';
 assert public.must_fail(format('select public.set_insect_review_vote(%L,1,''dead'')',(select id from targets where name='b'))), 'Uncertain reviewer regained seat without claim';
end$$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
do $$begin
 assert (select can_vote from public.claim_report_review('11111111-1111-1111-1111-111111111111') where insect_id=(select id from targets where name='b')), 'Uncertain did not free seat';
 assert (select count(*)=0 from public.insect_review_votes), 'Other labels leaked';
end$$;
select public.set_insect_review_vote(id,1,'dead') from targets where name='b';
select public.set_insect_review_vote(id,1,'alive') from targets where name='b';
select public.set_insect_review_vote(id,1,null) from targets where name='b';
-- Removing a label hides feedback again, and frees the seat.
do $$begin
 assert (select feedback is null from public.get_report_review('11111111-1111-1111-1111-111111111111') where insect_id=(select id from targets where name='b'));
end$$;
select * from public.claim_report_review('11111111-1111-1111-1111-111111111111');
select public.set_insect_review_vote(id,1,'alive') from targets where name='b';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select public.set_insect_review_vote(id,1,'alive') from targets where name='b';
select public.set_insect_review_vote(id,1,'alive') from targets where name='a';
-- Editing is allowed before finalization, and keeps one vote per person.
select public.set_insect_review_vote(id,1,'dead') from targets where name='a';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select public.set_insect_review_vote(id,1,'uncertain') from targets where name='b';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select public.set_insect_review_vote(id,1,'alive') from targets where name='b';
reset role;
do $$begin
 assert (select label='alive' and decision_source='community' from public.report_insects where id=(select id from targets where name='b'));
 assert (select workflow_status='pending_review' from public.reports where id='11111111-1111-1111-1111-111111111111'), 'Partially reviewed photo published';
 assert (select count(*)=0 from public.report_kill_credits), 'Partial credit awarded';
end$$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select public.set_insect_review_vote(id,1,'dead') from targets where name='a';
reset role;
do $$begin
 assert (select workflow_status='published' from public.reports where id='11111111-1111-1111-1111-111111111111');
 assert (select dead_insects=1 from public.report_kill_credits), 'Mixed photo credit incorrect';
 assert (select count(*)=0 from public.insect_review_claims where insect_id in (select id from targets where name in ('a','b'))), 'Final claims not cleared';
end$$;
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin
 assert public.must_fail(format('select public.set_insect_review_vote(%L,1,null)',(select id from targets where name='a'))), 'Final vote removed';
 assert (select verified_kills=1 from public.get_raw_upload_leaderboard('weekly')), 'Leaderboard credit missing';
 assert (select model_score=0.4 from public.get_insect_review_feedback((select id from targets where name='a'),1)), 'Consensus discarded model evidence';
end$$;
-- Admin veto and correction retain authority; new revisions ignore old votes.
set local request.jwt.claim.sub='cccccccc-cccc-cccc-cccc-cccccccccccc';
select public.admin_decide_report_insect(id,1,'alive','admin veto') from targets where name='a';
select public.admin_edit_report_insect('11111111-1111-1111-1111-111111111111',id,'{"x":2,"y":1,"width":20,"height":20}',true,'corrected box') from targets where name='a';
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin
 assert (select my_vote is null and feedback is null from public.get_report_review('11111111-1111-1111-1111-111111111111') where insect_id=(select id from targets where name='a')), 'Old revision labels reused';
 assert public.must_fail(format('select public.set_insect_review_vote(%L,1,''dead'')',(select id from targets where name='a'))), 'Stale box vote accepted';
 assert public.must_fail(format('select public.get_insect_review_feedback(%L,1)',(select id from targets where name='a'))), 'Old revision feedback leaked';
end$$;
reset role;
do $$begin assert (select dead_insects=0 from public.report_kill_credits), 'Admin veto did not remove credit'; end$$;
-- Claims expire and do not count as votes; inactive users cannot vote or claim.
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select * from public.claim_report_review('22222222-2222-2222-2222-222222222222');
reset role;
update public.insect_review_claims set expires_at=now()-interval '1 second' where insect_id=(select id from targets where name='expiry');
set local role authenticated;
do $$begin
 assert (select not can_vote from public.get_report_review('22222222-2222-2222-2222-222222222222'));
 assert public.must_fail(format('select public.set_insect_review_vote(%L,1,''dead'')',(select id from targets where name='expiry'))), 'Expired seat voted';
end$$;
reset role;
update public.member_activity set last_seen_at=now()-interval '15 days' where user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
set local role authenticated;
do $$begin
 assert public.must_fail($q$select public.claim_report_review('22222222-2222-2222-2222-222222222222')$q$), 'Inactive user claimed';
 assert public.must_fail(format('select public.set_insect_review_vote(%L,1,''alive'')',(select id from targets where name='expiry'))), 'Inactive user voted';
end$$;
reset role;
-- Released reservations are immediately available; decisive votes are retained.
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000006';
select * from public.claim_report_review('22222222-2222-2222-2222-222222222222');
select public.release_report_review('22222222-2222-2222-2222-222222222222');
reset role;
do $$begin
 assert not exists(select 1 from public.insect_review_claims where reviewer_id='00000000-0000-0000-0000-000000000006');
 assert (select count(*)>0 from public.report_audit_log where action='review_vote:UPDATE'), 'Vote changes not audited';
end$$;
update public.reports set review_started_at=now()-interval '49 hours' where id='22222222-2222-2222-2222-222222222222';
set local role authenticated;
set local request.jwt.claim.sub='cccccccc-cccc-cccc-cccc-cccccccccccc';
do $$begin assert exists(select 1 from public.report_admin_queue where id='22222222-2222-2222-2222-222222222222'), '48-hour escalation missing'; end$$;
reset role;
-- A corrected revision needs THREE NEW labels, regardless of old consensus.
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select * from public.claim_report_review('11111111-1111-1111-1111-111111111111');
select public.set_insect_review_vote(id,2,'dead') from targets where name='a';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select * from public.claim_report_review('11111111-1111-1111-1111-111111111111');
select public.set_insect_review_vote(id,2,'dead') from targets where name='a';
reset role;
do $$begin assert (select label='pending' from public.report_insects where id=(select id from targets where name='a')), 'Old votes contributed to new quorum'; end$$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select * from public.claim_report_review('11111111-1111-1111-1111-111111111111');
select public.set_insect_review_vote(id,2,'dead') from targets where name='a';
reset role;
do $$begin assert (select dead_insects=1 from public.report_kill_credits where report_id='11111111-1111-1111-1111-111111111111'), 'Correction credit not reconciled'; end$$;
-- All-alive community consensus still publishes a sighting with zero credit.
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select * from public.claim_report_review('22222222-2222-2222-2222-222222222222');
select public.set_insect_review_vote(id,1,'alive') from targets where name='expiry';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select * from public.claim_report_review('22222222-2222-2222-2222-222222222222');
select public.set_insect_review_vote(id,1,'alive') from targets where name='expiry';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select * from public.claim_report_review('22222222-2222-2222-2222-222222222222');
select public.set_insect_review_vote(id,1,'alive') from targets where name='expiry';
reset role;
do $$begin
 assert (select workflow_status='published' from public.reports where id='22222222-2222-2222-2222-222222222222'), 'Alive-only report hidden';
 assert (select dead_insects=0 from public.report_kill_credits where report_id='22222222-2222-2222-2222-222222222222'), 'Alive-only report earned credit';
end$$;
set local role service_role;
do $$begin
 assert public.must_fail(format('select public.record_report_insect_decision(%L,2,''dead'',''community'',''fake consensus'')',(select id from targets where name='a'))), 'Worker bypassed quorum';
end$$;
reset role;
rollback;
\echo 'Community review seats, quorum, voting edits, privacy, revisions, credits, and escalation passed.'
