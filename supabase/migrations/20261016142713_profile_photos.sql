insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Read own profile photo"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and owner_id = (select auth.uid()::text)
    and name = (select auth.uid()::text) || '/avatar.jpg'
  );

create policy "Upload own profile photo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and name = (select auth.uid()::text) || '/avatar.jpg'
  );

create policy "Replace own profile photo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-photos'
    and owner_id = (select auth.uid()::text)
    and name = (select auth.uid()::text) || '/avatar.jpg'
  )
  with check (
    bucket_id = 'profile-photos'
    and owner_id = (select auth.uid()::text)
    and name = (select auth.uid()::text) || '/avatar.jpg'
  );
