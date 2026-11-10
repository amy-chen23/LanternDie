-- Disposable PostgreSQL ONLY. Full migration chain; all fixtures roll back.
\set ON_ERROR_STOP on
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
-- Match Supabase broad default privileges; migration must explicitly narrow them.
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as
 $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,storage to authenticated,service_role;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(bucket_id text,name text,owner_id text);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
\ir ../../supabase/migrations/20261001230742_private_reports.sql
\ir ../../supabase/migrations/20261016142713_profile_photos.sql
\ir ../../supabase/migrations/20261018201510_report_details_community.sql
\ir ../../supabase/migrations/20261018201548_combine_report_read_policy.sql
\ir ../../supabase/migrations/20261019180000_report_identification.sql
\ir ../../supabase/migrations/20261107000000_death_assessments.sql
\ir ../../supabase/migrations/20261109000000_raw_upload_leaderboard.sql
insert into auth.users(id) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), -- uploader
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), -- reviewer
 ('cccccccc-cccc-cccc-cccc-cccccccccccc'); -- admin
insert into public.reports(id,user_id,photo_path) values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/one.jpg'),
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/two.jpg');
insert into storage.objects values('report-photos','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/one.jpg','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
\ir ../../supabase/migrations/20261110000000_report_overhaul_foundation.sql
create function public.must_fail(command text) returns boolean language plpgsql as $$
begin execute command; return false; exception when others then return true; end; $$;
grant execute on function public.must_fail(text) to authenticated,service_role;
