-- Identification and social reactions only. Apply separately after approval.
-- No dependency on draft migrations 16/17/18. Historical labels/credits remain.
-- New point allocation is deliberately paused; social votes never grant credit.
create or replace function private.reconcile_report(p_report_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.reports;
begin
 select * into r from public.reports where id=p_report_id for update;
 if not found then return; end if;
 if r.workflow_status='rejected' then
  -- Preserve the existing rejection/deletion policy, not a new credit grant.
  delete from public.report_kill_credits where report_id=r.id;
  return;
 end if;
 if r.insects_ready
  and exists(select 1 from public.report_insects where report_id=r.id and active)
  and exists(select 1 from public.report_photo_hashes where report_id=r.id)
  and exists(select 1 from public.report_identifications where report_id=r.id and status='detected') then
  update public.reports set workflow_status='published',published_at=coalesce(published_at,now()),review_started_at=null where id=r.id;
  -- Intentionally no INSERT/UPDATE of credit tables, regardless of labels/votes.
 elsif r.published_at is null then
  update public.reports set workflow_status=case
   when exists(select 1 from public.report_identifications where report_id=r.id and status='not_detected') then 'rejected'
   else 'pending_detection' end,review_started_at=null where id=r.id;
 end if;
end; $$;
revoke all on function private.reconcile_report(uuid) from public,anon,authenticated;

-- Empty/failed detector results never request human life-status review.
create or replace function private.route_report_detection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('failed','not_detected') then
  update public.reports set workflow_status=case when new.status='not_detected' then 'rejected' else 'pending_detection' end,
   review_started_at=null where id=new.report_id and published_at is null and workflow_status<>'rejected';
 end if;
 return null;
end; $$;
revoke all on function private.route_report_detection() from public,anon,authenticated;

-- Keep existing leases, retry limits, cooldowns and error codes. Terminal failures
-- stay in the owner's retry flow instead of the retired admin-review queue.
create or replace function public.fail_report_processing(p_report_id uuid,p_lease_token uuid,p_error_code text)
returns void language plpgsql security definer set search_path='' as $$
declare job public.report_processing_jobs; terminal boolean;
begin
 job := private.lock_processing_job(p_report_id,p_lease_token);
 if p_error_code is null or p_error_code not in ('photo_unavailable','configuration','inference_failed','worker_exhausted') then
  raise exception 'Invalid error code'; end if;
 terminal := job.attempts>=5 or p_error_code in ('configuration','worker_exhausted');
 update public.report_processing_jobs set status=case when terminal then 'failed' else 'retry' end,
  available_at=now()+make_interval(secs=>least(900,60*power(2,least(job.attempts-1,4)))::integer),
  lease_token=null,lease_until=null,last_error_code=p_error_code,updated_at=now() where report_id=p_report_id;
 if terminal then
  update public.reports set workflow_status='pending_detection',review_started_at=null
   where id=p_report_id and workflow_status in ('pending_detection','pending_review','admin_review');
 end if;
end; $$;
revoke all on function public.fail_report_processing(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fail_report_processing(uuid,uuid,text) to service_role;

-- Retire review queues and APIs, including stale clients. Retain immutable history
-- and role membership; no reviewer/admin label is needed for detection publication.
create or replace view public.report_verification_queue with (security_invoker=true) as
 select r.* from public.reports r where false;
create or replace view public.report_admin_queue with (security_invoker=true) as
 select r.* from public.reports r where false;
do $$declare target regprocedure; begin
 for target in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
   'claim_report_review','get_report_review','release_report_review','set_insect_review_vote',
   'get_insect_review_feedback','get_report_vote_summary','set_verification_vote',
   'record_report_insect_decision','admin_decide_report_insect','admin_publish_report',
   'admin_get_report_moderation','admin_moderate_report')
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',target); end loop;
end $$;

-- Keep author reactions, one vote per account, existing vote-count triggers and
-- existing SELECT/DELETE ownership policies. Voting is popularity, not validation.
drop policy "Vote on published reports" on public.report_votes;
drop policy "Change published vote" on public.report_votes;
create policy "Vote on published reports" on public.report_votes for insert to authenticated
 with check(voter_id=(select auth.uid()) and exists(select 1 from public.reports r
  where r.id=report_id and r.workflow_status='published'));
create policy "Change published vote" on public.report_votes for update to authenticated
 using(voter_id=(select auth.uid())) with check(voter_id=(select auth.uid())
  and exists(select 1 from public.reports r where r.id=report_id and r.workflow_status='published'));

-- Reconcile only unresolved posts. This publishes already-detected/hash-registered
-- posts without granting credits; existing published labels and credits are untouched.
do $$declare rid uuid; begin
 for rid in select id from public.reports where published_at is null
  and workflow_status in ('pending_detection','pending_review','admin_review') order by id
 loop perform private.reconcile_report(rid); end loop;
end $$;
