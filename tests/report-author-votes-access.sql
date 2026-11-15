-- Disposable PostgreSQL only. Fixtures, votes, and policies roll back.
\ir fixtures/report-schema.sql
\ir ../supabase/migrations/20261111000000_report_processing_jobs.sql
\ir ../supabase/migrations/20261112000000_community_review.sql
\ir ../supabase/migrations/20261113000000_admin_role_access.sql
\ir ../supabase/migrations/20261113183128_community_profile_photos.sql
-- An existing author choice must survive migration.
insert into public.report_votes(report_id,voter_id,value) values
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',-1);
\ir ../supabase/migrations/20261113183923_report_author_votes.sql
\ir ../supabase/migrations/20261114000000_admin_moderation.sql
\ir ../supabase/migrations/20261115000000_admin_attention_unclassified.sql

do $$begin
 assert (select upvotes=1 and downvotes=0 from public.reports where id='11111111-1111-1111-1111-111111111111'), 'Existing post missing author upvote';
 assert (select upvotes=0 and downvotes=1 from public.reports where id='22222222-2222-2222-2222-222222222222'), 'Existing author vote overwritten';
 assert not has_function_privilege('authenticated','private.seed_report_author_vote()','EXECUTE');
 assert not has_function_privilege('anon','private.seed_report_author_vote()','EXECUTE');
end$$;

set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
with inserted as (
 insert into public.reports(user_id,photo_path) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/three.jpg')
 returning id
) select set_config('test.report_id',id::text,true) from inserted;
do $$begin
 assert (select upvotes=1 and downvotes=0 from public.reports where id=current_setting('test.report_id')::uuid), 'New pending post missing upvote';
 assert (select value=1 from public.report_votes where report_id=current_setting('test.report_id')::uuid), 'Author upvote not selected';
 assert public.must_fail($q$update public.report_votes set value=-1 where report_id=current_setting('test.report_id')::uuid$q$), 'Pending social vote changed';
end$$;
reset role;
update public.reports set workflow_status='published' where id=current_setting('test.report_id')::uuid;
set local role authenticated;
-- Switch the automatic upvote to a downvote, remove it, and upvote again.
update public.report_votes set value=-1 where report_id=current_setting('test.report_id')::uuid;
do $$begin
 assert (select upvotes=0 and downvotes=1 from public.reports where id=current_setting('test.report_id')::uuid), 'Self downvote totals incorrect';
end$$;
delete from public.report_votes where report_id=current_setting('test.report_id')::uuid;
do $$begin
 assert (select upvotes=0 and downvotes=0 from public.reports where id=current_setting('test.report_id')::uuid), 'Self vote removal totals incorrect';
end$$;
insert into public.report_votes(report_id,voter_id,value) values
 (current_setting('test.report_id')::uuid,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',1);
do $$begin
 assert (select upvotes=1 and downvotes=0 from public.reports where id=current_setting('test.report_id')::uuid), 'Self upvote totals incorrect';
 assert public.must_fail($q$insert into public.report_votes(report_id,voter_id,value) values(current_setting('test.report_id')::uuid,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',1)$q$), 'Duplicate vote accepted';
end$$;
-- Other users retain normal voting but cannot impersonate the author.
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
update public.report_votes set value=-1 where report_id=current_setting('test.report_id')::uuid;
delete from public.report_votes where report_id=current_setting('test.report_id')::uuid;
do $$begin
 assert (select upvotes=1 and downvotes=0 from public.reports where id=current_setting('test.report_id')::uuid), 'Another user changed author vote';
 assert public.must_fail($q$insert into public.report_votes(report_id,voter_id,value) values('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',1)$q$), 'Pending post accepted social vote';
 assert public.must_fail($q$insert into public.report_votes(report_id,voter_id,value) values(current_setting('test.report_id')::uuid,'cccccccc-cccc-cccc-cccc-cccccccccccc',1)$q$), 'Vote impersonation accepted';
end$$;
insert into public.report_votes(report_id,voter_id,value) values
 (current_setting('test.report_id')::uuid,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',1);
do $$begin
 assert (select upvotes=2 and downvotes=0 from public.reports where id=current_setting('test.report_id')::uuid), 'Other member vote totals incorrect';
end$$;
-- Editing a post must not restore an author vote that was removed.
set local request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.report_votes where report_id=current_setting('test.report_id')::uuid;
update public.reports set caption='Edited' where id=current_setting('test.report_id')::uuid;
do $$begin
 assert (select upvotes=1 and downvotes=0 from public.reports where id=current_setting('test.report_id')::uuid), 'Edit restored removed author vote';
 assert not exists(select 1 from public.report_votes where report_id=current_setting('test.report_id')::uuid), 'Author vote restored';
end$$;
reset role;
rollback;
