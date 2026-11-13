-- Disposable PostgreSQL only. Fixtures and policies roll back.
\ir fixtures/report-schema.sql
\ir ../supabase/migrations/20261113183128_community_profile_photos.sql

insert into storage.objects(bucket_id,name,owner_id) values
 ('profile-photos','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/avatar.jpg','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('profile-photos','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/avatar.jpg','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
 ('profile-photos','cccccccc-cccc-cccc-cccc-cccccccccccc/avatar.jpg','cccccccc-cccc-cccc-cccc-cccccccccccc'),
 ('profile-photos','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/other.jpg','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin
 assert (select count(*)=1 from storage.objects where bucket_id='profile-photos'), 'Private report author avatar exposed';
end$$;
reset role;
update public.reports set workflow_status='published' where id='11111111-1111-1111-1111-111111111111';
set local role authenticated;
do $$begin
 assert (select count(*)=2 from storage.objects where bucket_id='profile-photos'), 'Published author avatar unavailable or unrelated files exposed';
 assert public.must_fail($q$insert into storage.objects(bucket_id,name,owner_id) values('profile-photos','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/avatar.jpg','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$q$), 'Viewer can upload another author avatar';
end$$;
update storage.objects set owner_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
 where name='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/avatar.jpg';
reset role;
do $$begin
 assert (select owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' from storage.objects where name='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/avatar.jpg'), 'Viewer can replace another author avatar';
end$$;
set local role authenticated;
set local request.jwt.claim.sub='';
do $$begin
 assert (select count(*)=0 from storage.objects where bucket_id='profile-photos'), 'Unauthenticated viewer can read avatars';
end$$;
reset role;
rollback;
