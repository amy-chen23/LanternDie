-- Disposable PostgreSQL only. Full migration chain; everything rolls back.
\ir fixtures/report-schema.sql
\ir ../supabase/migrations/20261111000000_report_processing_jobs.sql
\ir ../supabase/migrations/20261112000000_community_review.sql
\ir ../supabase/migrations/20261113000000_admin_role_access.sql

do $$begin
 assert (select count(*)=3 from auth.users), 'Migration changed existing users';
 assert exists(select 1 from pg_constraint where conrelid='public.app_admins'::regclass
  and confrelid='auth.users'::regclass and contype='f'), 'Admin role not linked to existing auth UUID';
 assert not has_table_privilege('authenticated','public.app_admins','INSERT');
 assert not has_table_privilege('authenticated','public.app_admins','DELETE');
 assert not has_table_privilege('authenticated','public.app_admins','SELECT');
 assert not has_function_privilege('anon','public.get_my_admin_status()','EXECUTE');
 assert has_function_privilege('authenticated','public.get_my_admin_status()','EXECUTE');
 assert public.must_fail($q$insert into public.app_admins(user_id) values('dddddddd-dddd-dddd-dddd-dddddddddddd')$q$), 'Unknown account granted role';
end$$;
update public.reports set workflow_status='admin_review';
-- User-editable metadata must never confer privileges.
update auth.users set raw_user_meta_data='{"role":"admin","is_admin":true}' where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin
 assert not public.get_my_admin_status(), 'Editable metadata granted admin';
 assert (select count(*)=0 from public.report_admin_queue), 'Non-admin queue access';
 assert public.must_fail($q$insert into public.app_admins(user_id) values('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$q$), 'Self promotion';
 assert public.must_fail($q$select public.get_my_admin_status('cccccccc-cccc-cccc-cccc-cccccccccccc')$q$), 'Can probe other user roles';
 assert public.must_fail($q$select public.admin_reject_report('11111111-1111-1111-1111-111111111111','pretend admin')$q$), 'Non-admin mutation';
end$$;
reset role;
-- Manual assignment references the existing account; no login/account migration.
set local role service_role;
insert into public.app_admins(user_id) values('cccccccc-cccc-cccc-cccc-cccccccccccc');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='cccccccc-cccc-cccc-cccc-cccccccccccc';
do $$begin
 assert public.get_my_admin_status();
 assert (select count(*)=2 from public.report_admin_queue), 'Admin queue missing';
end$$;
select public.admin_reject_report('11111111-1111-1111-1111-111111111111','test role-authorized decision');
reset role;
delete from public.app_admins where user_id='cccccccc-cccc-cccc-cccc-cccccccccccc';
-- Same JWT UUID, no logout/refresh required: DB revocation is immediate.
set local role authenticated;
do $$begin
 assert not public.get_my_admin_status(), 'Revocation needs token refresh';
 assert (select count(*)=0 from public.report_admin_queue), 'Revoked admin read queue';
 assert (select count(*)=0 from public.report_audit_log), 'Revoked admin read audit';
 assert public.must_fail($q$select public.admin_reject_report('22222222-2222-2222-2222-222222222222','revoked')$q$), 'Revoked admin mutated report';
end$$;
reset role;
insert into public.app_admins(user_id) values('cccccccc-cccc-cccc-cccc-cccccccccccc');
set local role authenticated;
do $$begin assert public.get_my_admin_status(), 'Reassignment did not take effect'; end$$;
reset role;
delete from auth.users where id='cccccccc-cccc-cccc-cccc-cccccccccccc';
set local role authenticated;
do $$begin assert not public.get_my_admin_status(), 'Deleted account retained role'; end$$;
reset role;
do $$begin
 assert not exists(select 1 from public.app_admins), 'Deleted user left admin membership';
 assert (select count(*)=2 from auth.users), 'Other existing accounts changed';
end$$;
rollback;
\echo 'Admin role UUID compatibility, metadata isolation, discovery, assignment, revocation and deletion passed.'
