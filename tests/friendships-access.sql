-- Run only against an empty disposable PostgreSQL database. Everything rolls back.
\ir fixtures/report-schema.sql
\ir ../supabase/migrations/20261120000000_friendships.sql

insert into storage.objects values
 ('profile-photos','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/avatar.jpg','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

do $$begin
 assert not has_table_privilege('anon','public.friend_requests','SELECT');
 assert not has_function_privilege('anon','public.accept_friend_request(uuid)','EXECUTE');
 assert not has_table_privilege('authenticated','public.friend_requests','UPDATE');
end$$;

set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$begin
 assert public.must_fail($q$insert into public.friend_requests(requester_id,recipient_id) values
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','cccccccc-cccc-cccc-cccc-cccccccccccc')$q$), 'Sender impersonation allowed';
 assert public.must_fail($q$insert into public.friend_requests(requester_id,recipient_id) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$q$), 'Self request allowed';
 assert public.must_fail($q$insert into public.friend_requests(requester_id,recipient_id,status) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','accepted')$q$), 'Preaccepted request allowed';
end$$;
with request as (
 insert into public.friend_requests(requester_id,recipient_id) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') returning id
) select set_config('test.friend_request_id',id::text,true) from request;
do $$begin
 assert public.must_fail($q$select public.accept_friend_request(current_setting('test.friend_request_id')::uuid)$q$), 'Sender accepted own request';
 assert public.must_fail($q$update public.friend_requests set status='accepted'$q$), 'Direct acceptance allowed';
end$$;

set local request.jwt.claim.sub='cccccccc-cccc-cccc-cccc-cccccccccccc';
do $$begin
 assert (select count(*)=0 from public.friend_requests), 'Third party read another pair';
 assert public.must_fail($q$select public.accept_friend_request(current_setting('test.friend_request_id')::uuid)$q$), 'Third party accepted';
end$$;
delete from public.friend_requests;

set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin
 assert (select count(*)=1 from public.friend_requests), 'Recipient cannot read request';
 assert exists(select 1 from public.community_profiles where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'Sender name hidden';
 assert exists(select 1 from storage.objects where bucket_id='profile-photos'), 'Sender avatar hidden';
 assert not exists(select 1 from public.reports), 'Friend request exposed private reports';
 assert public.must_fail($q$insert into public.friend_requests(requester_id,recipient_id) values
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$q$), 'Reverse duplicate allowed';
end$$;
select public.accept_friend_request(current_setting('test.friend_request_id')::uuid);
do $$begin
 assert (select status='accepted' from public.friend_requests), 'Acceptance failed';
 assert not exists(select 1 from public.reports), 'Friendship exposed private reports';
 assert public.must_fail($q$select public.accept_friend_request(current_setting('test.friend_request_id')::uuid)$q$), 'Repeated acceptance unexpectedly succeeded';
end$$;
delete from public.friend_requests;
do $$begin
 assert not exists(select 1 from storage.objects where bucket_id='profile-photos'), 'Removed friend still has avatar access';
 assert not exists(select 1 from public.community_profiles where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'Removed friend still has private profile access';
end$$;

-- A recipient can decline, and the sender can send a fresh request afterward.
set local request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into public.friend_requests(requester_id,recipient_id) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
delete from public.friend_requests;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into public.friend_requests(requester_id,recipient_id) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
delete from public.friend_requests;
do $$begin assert not exists(select 1 from public.friend_requests), 'Cancellation failed'; end$$;
reset role;
rollback;
