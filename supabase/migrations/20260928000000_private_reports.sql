create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  photo_path text not null unique,
  created_at timestamptz not null default now(),
  constraint photo_path_owned_by_user check (
    photo_path like user_id::text || '/%'
  )
);

create index reports_user_created_at_idx
  on public.reports (user_id, created_at desc);

alter table public.reports enable row level security;
revoke all on public.reports from anon;
grant select, insert, delete on public.reports to authenticated;

create policy "Read own reports"
  on public.reports for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Create own reports"
  on public.reports for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Delete own reports"
  on public.reports for delete to authenticated
  using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 5242880, array['image/jpeg']);

create policy "Read own report photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-photos'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Upload own report photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Delete own report photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-photos'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
