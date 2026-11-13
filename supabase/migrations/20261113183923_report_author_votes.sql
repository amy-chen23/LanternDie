-- Authors use the same social vote controls as everyone else on published posts.
drop policy "Vote on published reports" on public.report_votes;
drop policy "Change published vote" on public.report_votes;
create policy "Vote on published reports" on public.report_votes for insert to authenticated
 with check (voter_id = (select auth.uid()) and exists(select 1 from public.reports r
  where r.id = report_id and r.workflow_status = 'published'));
create policy "Change published vote" on public.report_votes for update to authenticated
 using (voter_id = (select auth.uid()))
 with check (voter_id = (select auth.uid()) and exists(select 1 from public.reports r
  where r.id = report_id and r.workflow_status = 'published'));

-- Seed a real, removable vote atomically with creation, including pending posts.
-- This private trigger needs definer rights because pending posts cannot receive
-- client votes. It only inserts the new report's author, never a caller-supplied voter.
create function private.seed_report_author_vote() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.report_votes(report_id,voter_id,value)
 values(new.id,new.user_id,1);
 return null;
end; $$;
revoke all on function private.seed_report_author_vote() from public,anon,authenticated,service_role;
create trigger seed_report_author_vote after insert on public.reports
 for each row execute function private.seed_report_author_vote();

-- The existing vote-count trigger maintains the totals for both new and old posts.
-- Preserve any author vote already present.
insert into public.report_votes(report_id,voter_id,value)
 select id,user_id,1 from public.reports
 on conflict(report_id,voter_id) do nothing;
