-- Reports remain subject to their existing RLS: this includes published authors
-- and review-queue authors only when the viewer can access their reports.
-- Keep the bucket private and preserve owner-only upload/update policies.
create policy "Read profile photos for accessible reports"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (select auth.uid()) is not null
    and exists (
      select 1 from public.reports r
      where storage.objects.name = r.user_id::text || '/avatar.jpg'
    )
  );
