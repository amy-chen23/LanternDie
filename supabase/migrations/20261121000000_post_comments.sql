create table public.report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now()
);
create index report_comments_report_created_idx on public.report_comments(report_id, created_at desc, id desc);
alter table public.report_comments enable row level security;
revoke all on public.report_comments from public, anon, authenticated;
grant select, delete on public.report_comments to authenticated;
grant insert(id, report_id, author_id, body) on public.report_comments to authenticated;

-- The nested report SELECT retains its RLS: hiding a post hides its comments too.
create policy "Read comments on accessible posts" on public.report_comments for select to authenticated
  using (exists(select 1 from public.reports r where r.id = report_id));
create policy "Comment as yourself on published posts" on public.report_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and exists (
    select 1 from public.reports r where r.id = report_id and r.workflow_status = 'published'
  ));
create policy "Delete own comments on accessible posts" on public.report_comments for delete to authenticated
  using (author_id = (select auth.uid()) and exists(select 1 from public.reports r where r.id = report_id));

-- A commenter need not have uploaded any reports for their name to be displayed.
-- This exposes display names only, never Auth email or private report details.
create policy "Read visible commenter names" on public.community_profiles for select to authenticated
  using (exists(select 1 from public.report_comments c where c.author_id = user_id));
