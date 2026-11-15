-- Disposable DB only. All migrations and fixtures roll back.
\ir fixtures/report-schema.sql
\ir ../supabase/migrations/20261111000000_report_processing_jobs.sql
\ir ../supabase/migrations/20261112000000_community_review.sql
\ir ../supabase/migrations/20261114231144_community_vote_summary.sql
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
-- No anonymous access or new raw vote access; public entrypoint is invoker.
do $$begin
 assert not has_function_privilege('anon','public.get_report_vote_summary(uuid)','EXECUTE');
 assert not has_function_privilege('anon','private.report_vote_summary(uuid)','EXECUTE');
 assert not (select prosecdef from pg_proc where oid='public.get_report_vote_summary(uuid)'::regprocedure);
 assert not has_table_privilege('authenticated','public.insect_review_votes','INSERT');
end$$;
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin
 assert (select count(*)=2 from public.get_report_vote_summary('11111111-1111-1111-1111-111111111111'));
 assert (select bool_and(alive_votes is null and dead_votes is null and uncertain_votes is null)
   from public.get_report_vote_summary('11111111-1111-1111-1111-111111111111')), 'Pre-vote totals leaked';
end$$;
select * from public.claim_report_review('11111111-1111-1111-1111-111111111111');
select public.set_insect_review_vote(id,1,'uncertain') from targets where name='a';
do $$begin
 assert (select alive_votes=0 and dead_votes=0 and uncertain_votes=1
   from public.get_report_vote_summary('11111111-1111-1111-1111-111111111111') where insect_id=(select id from targets where name='a'));
 assert (select alive_votes is null from public.get_report_vote_summary('11111111-1111-1111-1111-111111111111')
   where insect_id=(select id from targets where name='b')), 'One vote revealed another insect';
end$$;
select public.set_insect_review_vote(id,1,null) from targets where name='a';
do $$begin
 assert (select uncertain_votes is null from public.get_report_vote_summary('11111111-1111-1111-1111-111111111111')
   where insect_id=(select id from targets where name='a')), 'Removed response retained access';
end$$;
reset role;
-- Seed mixed community responses; these are anonymous aggregates, never identities.
insert into public.insect_review_votes(insect_id,revision,report_id,reviewer_id,label)
 select id,1,'11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','dead' from targets where name='a';
insert into public.insect_review_votes(insect_id,revision,report_id,reviewer_id,label)
 select id,1,'11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000001','uncertain' from targets where name='a';
-- Admin-confirmed mixed photo. Insect b has no community votes.
set local request.jwt.claim.sub='cccccccc-cccc-cccc-cccc-cccccccccccc';
update public.report_insects set label=case when id=(select id from targets where name='a') then 'dead' else 'alive' end,
 decision_source='admin',decided_at=now(),reason='Fixture decision'
 where report_id='11111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$begin
 assert (select dead_votes=1 and uncertain_votes=1 and final_label='dead'
   from public.get_report_vote_summary('11111111-1111-1111-1111-111111111111') where insect_id=(select id from targets where name='a')), 'Author cannot see approved results';
 assert (select alive_votes=0 and dead_votes=0 and uncertain_votes=0 and final_label='alive'
   from public.get_report_vote_summary('11111111-1111-1111-1111-111111111111') where insect_id=(select id from targets where name='b')), 'Zero responses became hidden';
end$$;
reset role;
-- Inactive nonvoters can read approved posts, but cannot claim review seats.
update public.member_activity set last_seen_at=now()-interval '15 days' where user_id='00000000-0000-0000-0000-000000000006';
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000006';
do $$begin
 assert (select dead_votes=1 from public.get_report_vote_summary('11111111-1111-1111-1111-111111111111') where insect_id=(select id from targets where name='a'));
 assert public.must_fail($q$select public.get_report_vote_summary('22222222-2222-2222-2222-222222222222')$q$), 'Inaccessible report exposed';
 assert public.must_fail($q$select public.get_report_vote_summary('99999999-9999-9999-9999-999999999999')$q$);
end$$;
reset role;
-- A correction leaves publication intact but removes approval. Old votes stay
-- historical; every unvoted current insect is hidden again until reapproval.
set local request.jwt.claim.sub='cccccccc-cccc-cccc-cccc-cccccccccccc';
update public.report_insects set box='{"x":2,"y":1,"width":20,"height":20}' where id=(select id from targets where name='a');
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin
 assert (select revision=2 and final_label is null and dead_votes is null and uncertain_votes is null
   from public.get_report_vote_summary('11111111-1111-1111-1111-111111111111') where insect_id=(select id from targets where name='a')), 'Old revision exposed';
 assert (select alive_votes is null from public.get_report_vote_summary('11111111-1111-1111-1111-111111111111')
   where insect_id=(select id from targets where name='b')), 'Partial finalization bypassed report approval';
end$$;
select * from public.claim_report_review('11111111-1111-1111-1111-111111111111');
select public.set_insect_review_vote(id,2,'alive') from targets where name='a';
do $$begin
 assert (select alive_votes=1 and dead_votes=0 and uncertain_votes=0
   from public.get_report_vote_summary('11111111-1111-1111-1111-111111111111') where insect_id=(select id from targets where name='a')), 'Historical votes counted';
end$$;
reset role;
set local request.jwt.claim.sub='cccccccc-cccc-cccc-cccc-cccccccccccc';
update public.report_insects set active=false where id=(select id from targets where name='a');
set local role authenticated;
do $$begin
 assert (select count(*)=1 from public.get_report_vote_summary('11111111-1111-1111-1111-111111111111')), 'Inactive insect returned';
end$$;
reset role;
update public.reports set workflow_status='rejected' where id='11111111-1111-1111-1111-111111111111';
set local role authenticated;
do $$begin
 assert public.must_fail($q$select public.get_report_vote_summary('11111111-1111-1111-1111-111111111111')$q$), 'Rejected results exposed';
end$$;
reset role;
set local request.jwt.claim.sub='';
do $$begin
 assert public.must_fail($q$select private.report_vote_summary('22222222-2222-2222-2222-222222222222')$q$), 'Missing auth accepted';
end$$;
rollback;
\echo 'Community vote summary permissions, approval, totals, and revisions passed.'
