-- Empty disposable PostgreSQL only. Never run fixtures in the shared project.
\ir fixtures/report-schema.sql
\ir ../supabase/migrations/20261121000000_post_comments.sql

update public.reports set workflow_status='published', visibility='public'
 where id='11111111-1111-1111-1111-111111111111';
update public.reports set workflow_status='published'
 where id='22222222-2222-2222-2222-222222222222';
do $$begin
 assert not has_table_privilege('anon','public.report_comments','SELECT');
 assert not has_table_privilege('authenticated','public.report_comments','UPDATE');
end$$;

set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin
 assert public.must_fail($q$insert into public.report_comments(report_id,author_id,body) values
 ('11111111-1111-1111-1111-111111111111','cccccccc-cccc-cccc-cccc-cccccccccccc','Impersonation')$q$), 'Impersonation allowed';
 assert public.must_fail($q$insert into public.report_comments(report_id,author_id,body) values
 ('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',E' \n\t ')$q$), 'Blank comment allowed';
 assert public.must_fail($q$insert into public.report_comments(report_id,author_id,body) values
 ('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',repeat('x',1001))$q$), 'Oversized comment allowed';
 assert public.must_fail($q$insert into public.report_comments(report_id,author_id,body) values
 ('22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Private post')$q$), 'Comment on inaccessible post allowed';
 assert public.must_fail($q$insert into public.report_comments(report_id,author_id,body,created_at) values
 ('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Spoofed time',now())$q$), 'Timestamp spoofing allowed';
end$$;
insert into public.report_comments(id,report_id,author_id,body) values
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','First comment');

set local request.jwt.claim.sub='cccccccc-cccc-cccc-cccc-cccccccccccc';
do $$begin
 assert (select count(*)=1 from public.report_comments), 'Member cannot read public comments';
 assert exists(select 1 from public.community_profiles where user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 'Commenter display name unavailable';
end$$;
delete from public.report_comments;
do $$begin assert (select count(*)=1 from public.report_comments), 'Another member deleted the comment'; end$$;

reset role;
update public.reports set visibility='private' where id='11111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin assert not exists(select 1 from public.report_comments), 'Comment author bypassed private-post access'; end$$;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$begin assert (select count(*)=1 from public.report_comments), 'Post owner cannot read comments'; end$$;
reset role;
update public.reports set visibility='public' where id='11111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
delete from public.report_comments where id='dddddddd-dddd-dddd-dddd-dddddddddddd';
do $$begin assert not exists(select 1 from public.report_comments), 'Own comment deletion failed'; end$$;

reset role;
update public.reports set workflow_status='pending_detection' where id='11111111-1111-1111-1111-111111111111';
set local role authenticated;
do $$begin
 assert public.must_fail($q$insert into public.report_comments(report_id,author_id,body) values
 ('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Pending post')$q$), 'Comment on unpublished post allowed';
end$$;
reset role;
rollback;
