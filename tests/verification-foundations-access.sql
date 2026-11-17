-- Disposable PostgreSQL ONLY. Everything, including roles and fixtures, rolls back.
\ir fixtures/report-schema.sql
\ir ../supabase/migrations/20261111000000_report_processing_jobs.sql
\ir ../supabase/migrations/20261112000000_community_review.sql
\ir ../supabase/migrations/20261113000000_admin_role_access.sql
\ir ../supabase/migrations/20261114000000_admin_moderation.sql
\ir ../supabase/migrations/20261115000000_admin_attention_unclassified.sql
create function public.must_fail_with(command text, pattern text) returns boolean language plpgsql as $$
begin execute command; return false; exception when others then return sqlerrm like pattern; end; $$;
grant execute on function public.must_fail_with(text,text) to authenticated,service_role;
insert into public.app_admins(user_id) values('cccccccc-cccc-cccc-cccc-cccccccccccc');
select public.register_report_photo_hash('11111111-1111-1111-1111-111111111111',repeat('a',64));
select public.register_report_photo_hash('22222222-2222-2222-2222-222222222222',repeat('b',64));
update public.reports set insects_ready=true where id='11111111-1111-1111-1111-111111111111';
insert into public.report_insects(id,report_id,box,label,decision_source,decided_at,reason) values
 ('a1111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','{"x":0,"y":0,"width":10,"height":10}','dead','admin',now(),'Historical decision one'),
 ('a2222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','{"x":20,"y":0,"width":10,"height":10}','dead','admin',now(),'Historical decision two');
insert into public.report_insects(id,report_id,box) values
 ('b1111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','{"x":0,"y":0,"width":10,"height":10}');
insert into public.insect_review_votes(insect_id,revision,report_id,reviewer_id,label)
 values('b1111111-1111-1111-1111-111111111111',1,'22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','uncertain');
create temp table before_reports as select * from public.reports;
create temp table before_insects as select * from public.report_insects;
create temp table before_votes as select * from public.insect_review_votes;
create temp table before_credits as select * from public.report_kill_credits;
create temp table before_audit as select * from public.report_audit_log;
\ir ../supabase/migrations/20261118000000_verification_foundations.sql

do $$ begin
 assert not exists((select * from before_reports except select * from public.reports) union all (select * from public.reports except select * from before_reports)), 'Migration changed reports';
 assert not exists((select * from before_insects except select * from public.report_insects) union all (select * from public.report_insects except select * from before_insects)), 'Migration changed final labels/geometry';
 assert not exists((select * from before_votes except select * from public.insect_review_votes) union all (select * from public.insect_review_votes except select * from before_votes)), 'Migration changed votes';
 assert not exists((select * from before_credits except select * from public.report_kill_credits) union all (select * from public.report_kill_credits except select * from before_credits)), 'Migration changed historical credits';
 assert (select dead_insects=2 from public.report_kill_credits where report_id='11111111-1111-1111-1111-111111111111'), 'Historical per-insect credit count changed';
 assert not exists((select * from before_audit except select * from public.report_audit_log) union all (select * from public.report_audit_log except select * from before_audit)), 'Migration created legacy audit mutations';
 assert (select count(*)=2 from public.insect_verifications where status='VERIFIED' and accepted_life_status='DEAD' and verification_method='legacy'), 'Legacy labels not preserved in shadow baseline';
 assert not exists(select 1 from public.insect_credit_accounts), 'Historical credits were migrated into new ledger';
 assert (select not live_enabled from public.verification_engine_settings), 'Live engine enabled';
 assert (select not auto_acceptance_enabled and review_seats=5 and matching_votes=3 and review_window_seconds=86400
   and high_dead_min is null and high_alive_max is null and detection_accept_min is null from public.verification_policies), 'Defaults changed or thresholds invented';
 assert not has_table_privilege('service_role','public.insect_model_predictions','INSERT'), 'Service can bypass prediction provenance RPC';
 assert not has_table_privilege('authenticated','public.insect_verifications','UPDATE'), 'Client can set verification';
 assert not has_table_privilege('authenticated','public.verification_contests','INSERT'), 'Contest workflow enabled';
 assert not has_column_privilege('authenticated','public.verification_policies','calibration_reference','SELECT'), 'Private calibration evidence exposed';
 assert not has_table_privilege('service_role','public.verification_contests','UPDATE'), 'Contest resolution exposed';
 assert not has_function_privilege('authenticated','public.record_shadow_credit_event(uuid,uuid,text,text,text)','EXECUTE'), 'Browser can authorize credit';
 assert not has_function_privilege('anon','public.record_browser_model_observation(uuid,integer,text,double precision,text,text,timestamptz,text)','EXECUTE'), 'Anonymous observations allowed';
 assert public.must_fail_with('update public.verification_engine_settings set live_enabled=true','%check constraint%'), 'Live flag can be enabled in M1';
end $$;

create temp table refs(name text primary key,id uuid);
grant select,insert,update on refs to authenticated,service_role;
set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into refs values('browser',public.record_browser_model_observation('b1111111-1111-1111-1111-111111111111',1,
 '57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d',0.9999,'DEAD','test',now(),'browser1'));
do $$ begin
 assert (select provenance='browser_untrusted' from public.insect_model_predictions where id=(select id from refs where name='browser')), 'Browser provenance not enforced';
 assert public.must_fail_with($q$select public.record_trusted_model_prediction('b1111111-1111-1111-1111-111111111111',1,'57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d',0.9999,'DEAD','node','test',now(),repeat('b',64),'fake')$q$,'%permission denied%'), 'Browser asserted server provenance';
 assert public.must_fail_with($q$select public.record_browser_model_observation('b1111111-1111-1111-1111-111111111111',2,'57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d',0.9,'DEAD','test',now(),'stale')$q$,'%revision is stale%'), 'Nonexistent box revision accepted';
 assert public.must_fail_with($q$select public.record_browser_model_observation('b1111111-1111-1111-1111-111111111111',1,'57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d',2,'DEAD','test',now(),'bad-score')$q$,'%check constraint%'), 'Invalid raw score accepted';
end $$;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$ begin
 assert (select count(*)=0 from public.insect_model_predictions), 'Owner predictions leaked to another reviewer';
 assert public.must_fail_with($q$select public.record_browser_model_observation('b1111111-1111-1111-1111-111111111111',1,'57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d',0.9,'DEAD','test',now(),'foreign')$q$,'%owner required%'), 'Foreign browser observation accepted';
end $$;
reset role;
-- TEST-ONLY approved policy; production seed remains disabled and unconfigured.
insert into public.verification_policies(version,detection_accept_min,detection_review_min,high_alive_max,medium_alive_max,medium_dead_min,high_dead_min,
 auto_acceptance_enabled,calibration_approved_at,calibration_approved_by,calibration_reference)
 values('fixture-only-not-production',0.9,0.4,0.01,0.2,0.8,0.99,true,now(),'cccccccc-cccc-cccc-cccc-cccccccccccc','TEST fixture');
set local role service_role;
insert into refs values('server',public.record_trusted_model_prediction('b1111111-1111-1111-1111-111111111111',1,
 '57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d',0.9999,'DEAD','node-cpu','test',now(),repeat('b',64),'server1'));
do $$ declare p uuid; fixture uuid; browser uuid; server uuid; d uuid; repeated uuid; begin
 select id into p from public.verification_policies where version='shadow-foundation-v1';
 select id into fixture from public.verification_policies where version='fixture-only-not-production';
 select id into browser from refs where name='browser'; select id into server from refs where name='server';
 assert public.must_fail_with($q$select public.record_trusted_model_prediction('b1111111-1111-1111-1111-111111111111',1,'57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d',0.9999,'DEAD','node-cpu','test',now(),repeat('f',64),'bad-hash')$q$,'%registered photo hash%'), 'Trusted record accepted arbitrary image';
 repeated:=public.record_trusted_model_prediction('b1111111-1111-1111-1111-111111111111',1,'57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d',0.9999,'DEAD','node-cpu','test',now(),repeat('b',64),'server1');
 assert repeated=server, 'Prediction retry duplicated evidence';
 assert public.must_fail_with(format('select public.transition_shadow_verification(%L,1,0,''VERIFIED'',''DEAD'',''admin'',%L,null,''skip'', ''skip'')','b1111111-1111-1111-1111-111111111111',p),'%Invalid verification transition%'), 'Skipped acceptance allowed';
 d:=public.transition_shadow_verification('b1111111-1111-1111-1111-111111111111',1,0,'AI_CLASSIFIED',null,'model',p,browser,'Record untrusted observation','classify-b');
 assert d=public.transition_shadow_verification('b1111111-1111-1111-1111-111111111111',1,0,'AI_CLASSIFIED',null,'model',p,browser,'Record untrusted observation','classify-b'), 'Decision retry duplicated';
 assert public.must_fail_with(format('select public.transition_shadow_verification(%L,1,1,''PROVISIONAL'',''DEAD'',''model'',%L,%L,''bad'',''untrusted'')','b1111111-1111-1111-1111-111111111111',fixture,browser),'%Trusted matching model evidence%'), 'Untrusted prediction authorized acceptance';
 assert public.must_fail_with(format('select public.transition_shadow_verification(%L,1,1,''PROVISIONAL'',''DEAD'',''model'',%L,%L,''disabled'',''disabled'')','b1111111-1111-1111-1111-111111111111',p,server),'%Automatic acceptance is disabled%'), 'Default auto-acceptance enabled';
 assert public.must_fail_with(format('select public.record_shadow_credit_event(%L,%L,''PROVISIONAL'',''browser-credit'',''fake'')','b1111111-1111-1111-1111-111111111111',d),'%Provisional credit requires%'), 'Observation alone awarded credit';
 d:=public.transition_shadow_verification('b1111111-1111-1111-1111-111111111111',1,1,'PROVISIONAL','DEAD','model',fixture,server,'TEST accepted trusted score','accept-b');
 assert (select finalization_deadline-provisionally_accepted_at=interval '24 hours' from public.insect_verifications where insect_id='b1111111-1111-1111-1111-111111111111'), 'Window did not begin at provisional acceptance';
 insert into refs values('accepted-b',d);
 repeated:=public.record_shadow_credit_event('b1111111-1111-1111-1111-111111111111',d,'PROVISIONAL','grant-b','TEST shadow grant');
 assert repeated=public.record_shadow_credit_event('b1111111-1111-1111-1111-111111111111',d,'PROVISIONAL','grant-b','TEST shadow grant'), 'Credit retry duplicated';
 assert public.must_fail_with(format('select public.record_shadow_credit_event(%L,%L,''PROVISIONAL'',''grant-b'',''different intent'')','b1111111-1111-1111-1111-111111111111',d),'%idempotency key conflicts%'), 'Conflicting credit replay accepted';
 assert public.must_fail_with(format('select public.record_shadow_credit_event(%L,%L,''PROVISIONAL'',''second-grant-b'',''another grant'')','b1111111-1111-1111-1111-111111111111',d),'%Invalid credit transition%'), 'Different keys duplicated same insect credit';
 assert public.must_fail_with(format('select public.transition_shadow_verification(%L,1,2,''VERIFIED'',''DEAD'',''system'',%L,%L,''early'',''early'')','b1111111-1111-1111-1111-111111111111',fixture,server),'%expired provisional window%'), 'Early system finalization accepted';
 assert public.must_fail_with(format('select public.transition_shadow_verification(%L,1,1,''CONTESTED'',''DEAD'',''admin'',%L,%L,''stale'',''stale'')','b1111111-1111-1111-1111-111111111111',fixture,server),'%Decision version changed%'), 'Stale worker changed decision';
end $$;
reset role;

do $$ begin
 assert public.must_fail_with('update public.insect_model_predictions set raw_dead_score=0.1','%append-only%'), 'Prediction mutable';
 assert public.must_fail_with('delete from public.verification_decisions','%append-only%'), 'Decision history deletable';
 assert public.must_fail_with('delete from public.insect_credit_events','%append-only%'), 'Credit history deletable';
 assert public.must_fail_with('update public.verification_policies set auto_acceptance_enabled=true where version=''shadow-foundation-v1''','%append-only%'), 'Policy history mutable';
end $$;
-- Simulate time only in this disposable fixture. No deadline job is introduced.
update public.insect_verifications set provisionally_accepted_at=now()-interval '25 hours',finalization_deadline=now()-interval '1 hour'
 where insect_id='b1111111-1111-1111-1111-111111111111';
insert into public.verification_contests(report_id,scope,reason_code,reason,opened_by,status,qualified_at)
 values('22222222-2222-2222-2222-222222222222','report','fraud','TEST report-wide hold','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','QUALIFIED',now());
set local role service_role;
do $$declare p uuid;pred uuid;begin
 select id into p from public.verification_policies where version='fixture-only-not-production';select id into pred from refs where name='server';
 assert public.must_fail_with(format('select public.transition_shadow_verification(%L,1,2,''VERIFIED'',''DEAD'',''system'',%L,%L,''held expiry'',''held-expiry'')','b1111111-1111-1111-1111-111111111111',p,pred),'%active hold%'), 'Expired window bypassed report fraud hold';
 assert public.must_fail_with(format('select public.transition_shadow_verification(%L,1,2,''VERIFIED'',''DEAD'',''system'',%L,null,''swap'',''swap-evidence'')','b1111111-1111-1111-1111-111111111111',p),'%retain accepted policy and evidence%'), 'System discarded accepted model evidence';
end$$;
reset role;
update public.verification_contests set status='DISMISSED',resolved_at=now(),resolved_by='cccccccc-cccc-cccc-cccc-cccccccccccc'
 where report_id='22222222-2222-2222-2222-222222222222';
set local role service_role;
do $$ declare d uuid; p uuid; pred uuid; begin
 select id into p from public.verification_policies where version='fixture-only-not-production';select id into pred from refs where name='server';
 d:=public.transition_shadow_verification('b1111111-1111-1111-1111-111111111111',1,2,'VERIFIED','DEAD','system',p,pred,'TEST elapsed window','final-b');
 perform public.record_shadow_credit_event('b1111111-1111-1111-1111-111111111111',d,'FINALIZED','final-credit-b','TEST finalization');
 assert (select sum(balance_delta)=1 from public.insect_credit_events), 'Finalizing counted a second credit';
end $$;
reset role;
-- Two insects in ONE new report each retain their own one-unit shadow identity.
insert into public.reports(id,user_id,photo_path) values
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/three.jpg');
select public.register_report_photo_hash('33333333-3333-3333-3333-333333333333',repeat('c',64));
insert into public.report_insects(id,report_id,box) values
 ('c1111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','{"x":0,"y":0,"width":10,"height":10}'),
 ('c2222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','{"x":20,"y":0,"width":10,"height":10}');
set local role service_role;
do $$ declare i uuid; p uuid; pred uuid; d uuid; begin
 select id into p from public.verification_policies where version='fixture-only-not-production';
 foreach i in array array['c1111111-1111-1111-1111-111111111111'::uuid,'c2222222-2222-2222-2222-222222222222'::uuid] loop
  pred:=public.record_trusted_model_prediction(i,1,'57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d',0.9999,'DEAD','node-cpu','test',now(),repeat('c',64),'predict-'||i);
  perform public.transition_shadow_verification(i,1,0,'AI_CLASSIFIED',null,'model',p,pred,'TEST classified','classify-'||i);
  d:=public.transition_shadow_verification(i,1,1,'PROVISIONAL','DEAD','model',p,pred,'TEST accepted','accept-'||i);
  perform public.record_shadow_credit_event(i,d,'PROVISIONAL','grant-'||i,'TEST grant');
 end loop;
 assert (select count(*)=2 from public.insect_credit_accounts where report_id='33333333-3333-3333-3333-333333333333'), 'Report incorrectly capped at one insect';
 select id into pred from public.insect_model_predictions where insect_id='c1111111-1111-1111-1111-111111111111';
 d:=public.transition_shadow_verification('c1111111-1111-1111-1111-111111111111',1,2,'CONTESTED','DEAD','admin',p,pred,'TEST disputed','contest-c1');
 perform public.record_shadow_credit_event('c1111111-1111-1111-1111-111111111111',d,'HELD','hold-c1','TEST insect hold');
 assert (select status='PROVISIONAL' from public.insect_credit_accounts where insect_id='c2222222-2222-2222-2222-222222222222'), 'Uncontested sibling credit held';
 assert (select sum(e.balance_delta)=1 from public.insect_credit_events e join public.insect_credit_accounts a on a.id=e.account_id
   where a.report_id='33333333-3333-3333-3333-333333333333'), 'Per-insect hold removed unrelated credit';
end $$;
reset role;
-- Contest rows are owner-only fixtures, not a new contest processing endpoint.
insert into public.verification_contests(report_id,insect_id,box_revision,scope,reason_code,reason,opened_by,status,qualified_at)
 values('33333333-3333-3333-3333-333333333333','c1111111-1111-1111-1111-111111111111',1,'insect','life_status','TEST evidence','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','QUALIFIED',now());
set local role service_role;
do $$ declare p uuid; begin
 select id into p from public.verification_policies where version='fixture-only-not-production';
 assert public.must_fail_with(format('select public.transition_shadow_verification(%L,1,3,''VERIFIED'',''ALIVE'',''admin'',%L,null,''held'',''held-final'')','c1111111-1111-1111-1111-111111111111',p),'%active hold%'), 'Qualifying contest bypassed';
end $$;
reset role;
update public.verification_contests set status='RESOLVED',resolved_at=now(),resolution='OVERTURNED',resolved_by='cccccccc-cccc-cccc-cccc-cccccccccccc' where status='QUALIFIED';
set local role service_role;
do $$ declare p uuid; d uuid; begin
 select id into p from public.verification_policies where version='fixture-only-not-production';
 d:=public.transition_shadow_verification('c1111111-1111-1111-1111-111111111111',1,3,'VERIFIED','ALIVE','admin',p,null,'TEST overturned','overturn-c1');
 perform public.record_shadow_credit_event('c1111111-1111-1111-1111-111111111111',d,'REVERSED','reverse-c1','TEST reversal');
 assert (select status='REVERSED' from public.insect_credit_accounts where insect_id='c1111111-1111-1111-1111-111111111111'), 'Overturn did not reverse shadow credit';
end $$;
reset role;
-- Corrections preserve old evidence and create a distinct current revision.
update public.report_insects set box='{"x":2,"y":2,"width":10,"height":10}' where id='c2222222-2222-2222-2222-222222222222';
do $$ begin
 assert (select count(*)=2 from public.verification_insect_revisions where insect_id='c2222222-2222-2222-2222-222222222222'), 'Geometry history lost';
 assert (select status='PENDING' and accepted_life_status is null from public.insect_verifications where insect_id='c2222222-2222-2222-2222-222222222222' and box_revision=2), 'New box inherited old decision';
 assert exists(select 1 from public.insect_model_predictions where insect_id='c2222222-2222-2222-2222-222222222222' and box_revision=1), 'Correction erased old prediction';
 assert public.must_fail_with($q$insert into public.insect_model_predictions(report_id,insect_id,box_revision,raw_dead_score,model_sha256,model_version,preprocessing_version,provenance,inference_runtime,runtime_version,inference_at,idempotency_key) values('33333333-3333-3333-3333-333333333333','c2222222-2222-2222-2222-222222222222',999,0.8,'57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d','test','test','browser_untrusted','test','test',now(),'bad-fk')$q$,'%foreign key constraint%'), 'Nonexistent geometry FK accepted';
 assert (select dead_insects=2 from public.report_kill_credits where report_id='11111111-1111-1111-1111-111111111111'), 'Shadow operations changed historical credit';
 assert (select count(*)=1 from public.report_kill_credits), 'Shadow grants leaked into live leaderboard';
end $$;
set local role service_role;
do $$ begin
 assert public.must_fail_with($q$select public.record_trusted_model_prediction('c2222222-2222-2222-2222-222222222222',1,'57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d',0.99,'DEAD','node','test',now(),repeat('c',64),'old-revision')$q$,'%revision is stale%'), 'Corrected box accepted stale prediction';
end $$;
reset role;
-- Audit references do not block the existing report/account deletion workflow.
delete from public.reports where id='33333333-3333-3333-3333-333333333333';
do $$ begin
 assert exists(select 1 from public.insect_model_predictions where report_id='33333333-3333-3333-3333-333333333333'), 'Deleting report erased inference audit';
 assert exists(select 1 from public.insect_credit_events), 'Deleting report erased shadow credit history';
end $$;
rollback;
\echo 'Verification M1: additive preservation, provenance, revisions, transitions, defaults, per-insect idempotent credits, holds and legacy isolation passed.'
