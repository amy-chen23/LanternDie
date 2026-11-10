-- Disposable database only. Apply latest schema and roll back every fixture.
\ir fixtures/report-schema.sql
\ir ../supabase/migrations/20261111000000_report_processing_jobs.sql
\ir ../supabase/migrations/20261112000000_community_review.sql
\ir ../supabase/migrations/20261113000000_admin_role_access.sql
\ir ../supabase/migrations/20261114000000_admin_moderation.sql
\ir ../supabase/migrations/20261115000000_admin_attention_unclassified.sql
insert into public.app_admins(user_id) values('cccccccc-cccc-cccc-cccc-cccccccccccc');
insert into public.report_insects(report_id,box) values
 ('11111111-1111-1111-1111-111111111111','{"x":1,"y":1,"width":5,"height":5}');
update public.reports set workflow_status='admin_review' where id='22222222-2222-2222-2222-222222222222';
set local role authenticated;
set local request.jwt.claim.sub='cccccccc-cccc-cccc-cccc-cccccccccccc';
do $$begin
 assert (select count(*)=2 from public.report_admin_queue), 'Fresh unclassified report missing';
 assert exists(select 1 from public.report_admin_queue where id='11111111-1111-1111-1111-111111111111' and review_started_at=now()), 'Queue waited 48 hours';
end$$;
reset role;
-- Published box corrections remain visible and also need immediate attention.
update public.reports set workflow_status='published',published_at=now() where id='11111111-1111-1111-1111-111111111111';
set local role authenticated;
do $$begin assert (select count(*)=2 from public.report_admin_queue), 'Published correction missing'; end$$;
reset role;
update public.report_insects set label='alive',decision_source='admin',decided_at=now(),reason='final review'
 where report_id='11111111-1111-1111-1111-111111111111';
set local role authenticated;
do $$begin assert (select count(*)=1 from public.report_admin_queue), 'Fully classified report still queued'; end$$;
reset role;
update public.reports set workflow_status='rejected' where id='22222222-2222-2222-2222-222222222222';
set local role authenticated;
do $$begin assert (select count(*)=0 from public.report_admin_queue), 'Rejected report queued'; end$$;
reset role;
update public.reports set workflow_status='pending_review' where id='22222222-2222-2222-2222-222222222222';
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin assert (select count(*)=0 from public.report_admin_queue), 'Ordinary member read attention queue'; end$$;
reset role;
delete from public.app_admins;
set local role authenticated;
set local request.jwt.claim.sub='cccccccc-cccc-cccc-cccc-cccccccccccc';
do $$begin assert (select count(*)=0 from public.report_admin_queue), 'Revoked admin read attention queue'; end$$;
reset role;
rollback;
\echo 'Immediate unclassified attention, published corrections, final/rejected filtering and admin-only access passed.'
