-- Database foundation only. Deploy the new upload/review clients before rollout.
-- Old native scores and social votes NEVER finalize these insect decisions.
create table public.app_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from public, anon, authenticated;
grant all on public.app_admins to service_role;

create function private.is_report_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.app_admins where user_id = auth.uid());
$$;
grant usage on schema private to authenticated, service_role;
revoke all on function private.is_report_admin() from public, anon;
grant execute on function private.is_report_admin() to authenticated, service_role;

create table public.member_activity (
 user_id uuid primary key references auth.users(id) on delete cascade,
 last_seen_at timestamptz not null default now()
);
alter table public.member_activity enable row level security;
revoke all on public.member_activity from public, anon, authenticated;
grant select on public.member_activity to authenticated;
grant all on public.member_activity to service_role;
create policy "Read own activity" on public.member_activity for select to authenticated
 using (user_id = (select auth.uid()) or (select private.is_report_admin()));
create function public.touch_member_activity() returns void
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 insert into public.member_activity(user_id) values(auth.uid())
 on conflict(user_id) do update set last_seen_at = now();
end; $$;
revoke all on function public.touch_member_activity() from public, anon;
grant execute on function public.touch_member_activity() to authenticated;
create function private.is_active_reviewer() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.member_activity
 where user_id = auth.uid() and last_seen_at >= now() - interval '14 days');
$$;
revoke all on function private.is_active_reviewer() from public, anon;
grant execute on function private.is_active_reviewer() to authenticated, service_role;

alter table public.reports
 add column workflow_status text not null default 'pending_detection'
   check (workflow_status in ('pending_detection','pending_review','admin_review','published','rejected')),
 add column insects_ready boolean not null default false,
 add column published_at timestamptz,
 add column review_started_at timestamptz;
-- Explicitly authorized beta migration: formerly private images enter public workflow.
update public.reports set visibility = 'public';
alter table public.reports alter column visibility set default 'public';
alter table public.reports drop constraint reports_visibility_check;
alter table public.reports add constraint reports_visibility_check check (visibility = 'public');
-- A legacy client may still send public, but cannot edit workflow or ownership.
revoke insert, update on public.reports from authenticated;
revoke update(visibility) on public.reports from authenticated;
grant insert(user_id,photo_path,observed_on,place_name,caption,visibility) on public.reports to authenticated;
grant update(observed_on,place_name,caption) on public.reports to authenticated;
create index reports_workflow_queue_idx on public.reports(created_at,id)
 where workflow_status in ('pending_review','admin_review');

-- Tombstone registry: hash survives both report and account deletion.
-- Hash exact stored JPEG bytes in the trusted worker; never accept a phone's hash as proof.
create table public.report_photo_hashes (
 sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
 report_id uuid unique references public.reports(id) on delete set null,
 registered_at timestamptz not null default now()
);
alter table public.report_photo_hashes enable row level security;
revoke all on public.report_photo_hashes from public, anon, authenticated, service_role;
grant select, insert on public.report_photo_hashes to service_role;
create function public.register_report_photo_hash(p_report_id uuid,p_sha256 text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 perform 1 from public.reports where id = p_report_id for update;
 if not found then raise exception 'Report not found'; end if;
 if exists(select 1 from public.report_photo_hashes where report_id = p_report_id and sha256 = p_sha256) then return; end if;
 insert into public.report_photo_hashes(sha256,report_id) values(p_sha256,p_report_id);
end; $$;
revoke all on function public.register_report_photo_hash(uuid,text) from public, anon, authenticated;
grant execute on function public.register_report_photo_hash(uuid,text) to service_role;

-- Enable a model version only after independent evaluation and cutoff selection.
alter table public.death_model_versions add column automatic_approval_enabled boolean not null default false;

create table public.report_insects (
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null references public.reports(id) on delete cascade,
 box jsonb not null,
 revision integer not null default 1 check (revision > 0),
 active boolean not null default true,
 label text not null default 'pending' check (label in ('pending','alive','dead')),
 model_sha256 text references public.death_model_versions(sha256),
 model_score double precision check (model_score between 0 and 1),
 decision_source text check (decision_source in ('model','community','admin')),
 decided_at timestamptz,
 reason text,
 updated_at timestamptz not null default now(),
 constraint insect_decision_complete check (
  (label = 'pending' and decision_source is null and decided_at is null)
  or (label <> 'pending' and decision_source is not null and decided_at is not null
      and char_length(btrim(reason)) > 0 and reason is not null)
 )
);
create index report_insects_report_idx on public.report_insects(report_id);
alter table public.report_insects enable row level security;
revoke all on public.report_insects from public, anon, authenticated, service_role;
grant select(id,report_id,box,revision,active,label,decision_source,decided_at,reason,updated_at) on public.report_insects to authenticated;
grant select on public.report_insects to service_role;
create policy "Read insects for accessible reports" on public.report_insects for select to authenticated
 using (exists(select 1 from public.reports r where r.id = report_id));

-- Current committed credit snapshot. Retain during corrections to published posts;
-- atomically replace only once ALL active boxes have final decisions.
create table public.report_kill_credits (
 report_id uuid primary key references public.reports(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 dead_insects integer not null check (dead_insects >= 0),
 updated_at timestamptz not null default now()
);
alter table public.report_kill_credits enable row level security;
revoke all on public.report_kill_credits from public, anon, authenticated, service_role;
grant select on public.report_kill_credits to authenticated;
grant select on public.report_kill_credits to service_role;
create policy "Read published credits or own credits" on public.report_kill_credits for select to authenticated
 using (user_id = (select auth.uid()) or exists(select 1 from public.reports r
 where r.id = report_id and r.workflow_status = 'published') or (select private.is_report_admin()));

-- No foreign keys: evidence survives deletion. Audit is admin/service only.
create table public.report_audit_log (
 id bigint generated always as identity primary key,
 report_id uuid not null,
 insect_id uuid,
 actor_id uuid,
 action text not null,
 old_data jsonb,
 new_data jsonb,
 created_at timestamptz not null default now()
);
alter table public.report_audit_log enable row level security;
revoke all on public.report_audit_log from public, anon, authenticated, service_role;
grant select on public.report_audit_log to authenticated, service_role;
create policy "Admins read report audit" on public.report_audit_log for select to authenticated
 using ((select private.is_report_admin()));

create function private.audit_report_overhaul() returns trigger
language plpgsql security definer set search_path = '' as $$
declare before_row jsonb; after_row jsonb; rid uuid; iid uuid;
begin
 if tg_op <> 'INSERT' then before_row := to_jsonb(old); end if;
 if tg_op <> 'DELETE' then after_row := to_jsonb(new); end if;
 if tg_table_name = 'reports' then
  rid := coalesce(new.id,old.id);
  -- Do not audit unrelated likes/caption edits as verification events.
  if tg_op = 'UPDATE' and new.workflow_status = old.workflow_status
    and new.published_at is not distinct from old.published_at then return null; end if;
 else
  rid := coalesce(new.report_id,old.report_id);
  if tg_table_name = 'report_insects' then iid := coalesce(new.id,old.id); end if;
 end if;
 insert into public.report_audit_log(report_id,insect_id,actor_id,action,old_data,new_data)
 values(rid,iid,auth.uid(),tg_table_name || ':' || tg_op,before_row,after_row);
 return null;
end; $$;
revoke all on function private.audit_report_overhaul() from public, anon, authenticated;
create trigger audit_report_state after insert or update or delete on public.reports
 for each row execute function private.audit_report_overhaul();
create trigger audit_insect_state after insert or update or delete on public.report_insects
 for each row execute function private.audit_report_overhaul();
create trigger audit_kill_credit after insert or update or delete on public.report_kill_credits
 for each row execute function private.audit_report_overhaul();

create function private.reconcile_report(p_report_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports; total integer; pending integer; dead integer;
begin
 select * into r from public.reports where id = p_report_id for update;
 if not found then return; end if;
 if r.workflow_status = 'rejected' then
  delete from public.report_kill_credits where report_id = r.id;
  return;
 end if;
 select count(*),count(*) filter(where label = 'pending'),count(*) filter(where label = 'dead')
 into total,pending,dead from public.report_insects where report_id = r.id and active;
 if r.insects_ready and total > 0 and pending = 0 and exists(select 1 from public.report_photo_hashes where report_id = r.id) then
  update public.reports set workflow_status = 'published',published_at = coalesce(published_at,now()) where id = r.id;
  insert into public.report_kill_credits(report_id,user_id,dead_insects) values(r.id,r.user_id,dead)
  on conflict(report_id) do update set dead_insects = excluded.dead_insects,updated_at = now();
 elsif r.published_at is not null and total = 0 then
  -- Removing every box must never leave phantom kill credit. Keep the post
  -- visible as requested; an admin may separately reject the report.
  delete from public.report_kill_credits where report_id = r.id;
 elsif r.published_at is null then
  update public.reports set workflow_status = case when total > 0 then 'pending_review'
      when r.workflow_status = 'pending_detection' then 'pending_detection' else 'admin_review' end,
    review_started_at = case when total > 0 or r.workflow_status = 'admin_review'
      then coalesce(review_started_at,now()) else review_started_at end where id = r.id;
 end if;
end; $$;
revoke all on function private.reconcile_report(uuid) from public, anon, authenticated;

create function private.validate_report_insect() returns trigger
language plpgsql security definer set search_path = '' as $$
declare key text; n double precision;
begin
 -- Serialize box edits/decisions and credit changes on the parent report.
 perform 1 from public.reports where id = new.report_id for update;
 if tg_op = 'UPDATE' and (new.id <> old.id or new.report_id <> old.report_id) then
  raise exception 'Insect identity is immutable'; end if;
 if tg_op = 'INSERT' then
  update public.reports set review_started_at = case when published_at is not null then now()
   else coalesce(review_started_at,now()) end where id = new.report_id;
 end if;
 if jsonb_typeof(new.box) is distinct from 'object' then raise exception 'Invalid box'; end if;
 foreach key in array array['x','y','width','height'] loop
  if jsonb_typeof(new.box -> key) is distinct from 'number' then raise exception 'Invalid box'; end if;
  n := (new.box ->> key)::double precision;
  if n < 0 or (key in ('width','height') and n <= 0) then raise exception 'Invalid box'; end if;
 end loop;
 if tg_op = 'UPDATE' then
  if old.decision_source = 'admin' and not private.is_report_admin()
    and (new.label,new.box,new.active,new.decision_source) is distinct from (old.label,old.box,old.active,old.decision_source) then
   raise exception 'Only admins can override an admin decision'; end if;
  if new.box is distinct from old.box or new.active is distinct from old.active then
   new.revision := old.revision + 1;
   new.label := 'pending'; new.decision_source := null; new.decided_at := null; new.reason := null;
   new.model_sha256 := null; new.model_score := null;
   update public.reports set review_started_at = now() where id = new.report_id;
  else new.revision := old.revision; end if;
 end if;
 if new.decision_source = 'model' and (new.label <> 'dead' or new.model_score is null or not exists(
  select 1 from public.death_model_versions m where m.sha256 = new.model_sha256
   and m.automatic_approval_enabled and new.model_score >= m.threshold)) then
  raise exception 'Automatic model approval is not enabled or cutoff not met'; end if;
 new.updated_at := now();
 return new;
end; $$;
revoke all on function private.validate_report_insect() from public, anon, authenticated;
create trigger validate_insect before insert or update on public.report_insects
 for each row execute function private.validate_report_insect();
create function private.insect_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform private.reconcile_report(coalesce(new.report_id,old.report_id)); return null; end; $$;
revoke all on function private.insect_changed() from public, anon, authenticated;
create trigger reconcile_insects after insert or update or delete on public.report_insects
 for each row execute function private.insect_changed();
-- Hash registration may finish after insect inference.
create trigger reconcile_hash after insert on public.report_photo_hashes
 for each row execute function private.insect_changed();

create function public.admin_edit_report_insect(p_report_id uuid,p_insect_id uuid,p_box jsonb,p_active boolean,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 if not private.is_report_admin() then raise exception 'Admin required'; end if;
 if p_reason is null or char_length(btrim(p_reason)) = 0 then raise exception 'Reason required'; end if;
 perform 1 from public.reports where id = p_report_id for update;
 if not found then raise exception 'Report not found'; end if;
 if p_insect_id is null then
  insert into public.report_insects(report_id,box,active) values(p_report_id,p_box,p_active) returning id into result;
 else
  update public.report_insects set box = p_box,active = p_active where id = p_insect_id and report_id = p_report_id returning id into result;
  if not found then raise exception 'Insect not found'; end if;
 end if;
 insert into public.report_audit_log(report_id,insect_id,actor_id,action,new_data)
 values(p_report_id,result,auth.uid(),'admin_box_edit',jsonb_build_object('reason',p_reason));
 return result;
end; $$;
revoke all on function public.admin_edit_report_insect(uuid,uuid,jsonb,boolean,text) from public, anon;
grant execute on function public.admin_edit_report_insect(uuid,uuid,jsonb,boolean,text) to authenticated;

create function public.admin_decide_report_insect(p_insect_id uuid,p_revision integer,p_label text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare rid uuid;
begin
 if not private.is_report_admin() then raise exception 'Admin required'; end if;
 if p_label is null or p_label not in ('alive','dead') or p_reason is null or char_length(btrim(p_reason)) = 0 then
  raise exception 'Final label and reason required'; end if;
 select report_id into rid from public.report_insects where id = p_insect_id;
 perform 1 from public.reports where id = rid for update;
 update public.report_insects set label = p_label,decision_source = 'admin',decided_at = now(),reason = p_reason,model_sha256 = null,model_score = null
 where id = p_insect_id and revision = p_revision and active;
 if not found then raise exception 'Insect missing or revision changed'; end if;
end; $$;
revoke all on function public.admin_decide_report_insect(uuid,integer,text,text) from public, anon;
grant execute on function public.admin_decide_report_insect(uuid,integer,text,text) to authenticated;

create function public.admin_reject_report(p_report_id uuid,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_report_admin() then raise exception 'Admin required'; end if;
 if p_reason is null or char_length(btrim(p_reason)) = 0 then raise exception 'Reason required'; end if;
 update public.reports set workflow_status = 'rejected' where id = p_report_id;
 if not found then raise exception 'Report not found'; end if;
 perform private.reconcile_report(p_report_id);
 insert into public.report_audit_log(report_id,actor_id,action,new_data)
 values(p_report_id,auth.uid(),'admin_reject',jsonb_build_object('reason',p_reason));
end; $$;
revoke all on function public.admin_reject_report(uuid,text) from public, anon;
grant execute on function public.admin_reject_report(uuid,text) to authenticated;

-- The worker seeds the ENTIRE detection snapshot atomically; partial batches
-- cannot accidentally publish a multi-insect report. Existing test results are
-- deliberately not imported automatically.
create function public.initialize_report_insects(p_report_id uuid,p_detector_updated_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare gate public.report_identifications; item jsonb;
begin
 perform 1 from public.reports where id = p_report_id for update;
 if not found then raise exception 'Report not found'; end if;
 select * into gate from public.report_identifications where report_id = p_report_id for share;
 if not found or gate.updated_at <> p_detector_updated_at or gate.status <> 'detected'
   or jsonb_array_length(gate.detections) = 0 then raise exception 'Current detections required'; end if;
 if exists(select 1 from public.report_insects where report_id = p_report_id) then
  raise exception 'Insects already initialized; admin correction required'; end if;
 for item in select * from jsonb_array_elements(gate.detections) loop
  insert into public.report_insects(report_id,box) values(p_report_id,
   jsonb_build_object('x',item->'x','y',item->'y','width',item->'width','height',item->'height'));
 end loop;
 update public.reports set insects_ready = true,review_started_at = coalesce(review_started_at,now()) where id = p_report_id;
 perform private.reconcile_report(p_report_id);
end; $$;
revoke all on function public.initialize_report_insects(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.initialize_report_insects(uuid,timestamptz) to service_role;

-- Only a trusted worker may submit model/consensus decisions. It must compute
-- inference or verify quorum itself; legacy phone scores/votes are not evidence.
create function public.record_report_insect_decision(p_insect_id uuid,p_revision integer,
 p_label text,p_source text,p_reason text,p_model_sha256 text default null,p_model_score double precision default null)
returns void language plpgsql security definer set search_path = '' as $$
declare rid uuid;
begin
 if p_source is null or p_source not in ('model','community') or p_label is null or p_label not in ('alive','dead')
  or p_reason is null or char_length(btrim(p_reason)) = 0 then raise exception 'Invalid worker decision'; end if;
 if p_source = 'community' and (p_model_sha256 is not null or p_model_score is not null) then
  raise exception 'Community decision cannot contain model evidence'; end if;
 select report_id into rid from public.report_insects where id = p_insect_id;
 perform 1 from public.reports where id = rid for update;
 update public.report_insects set label = p_label,decision_source = p_source,reason = p_reason,decided_at = now(),
  model_sha256 = p_model_sha256,model_score = p_model_score
 where id = p_insect_id and revision = p_revision and active and label = 'pending';
 if not found then raise exception 'Insect missing, revision changed, or decision already final'; end if;
end; $$;
revoke all on function public.record_report_insect_decision(uuid,integer,text,text,text,text,double precision) from public, anon, authenticated;
grant execute on function public.record_report_insect_decision(uuid,integer,text,text,text,text,double precision) to service_role;

create function public.admin_publish_report(p_report_id uuid,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_report_admin() then raise exception 'Admin required'; end if;
 if p_reason is null or char_length(btrim(p_reason)) = 0 then raise exception 'Reason required'; end if;
 perform 1 from public.reports where id = p_report_id for update;
 if not found then raise exception 'Report not found'; end if;
 if not exists(select 1 from public.report_photo_hashes where report_id = p_report_id)
  or not exists(select 1 from public.report_insects where report_id = p_report_id and active)
  or exists(select 1 from public.report_insects where report_id = p_report_id and active and label = 'pending') then
  raise exception 'Hash registration and final insect decisions required'; end if;
 update public.reports set insects_ready = true,workflow_status = 'pending_review' where id = p_report_id;
 perform private.reconcile_report(p_report_id);
 insert into public.report_audit_log(report_id,actor_id,action,new_data)
 values(p_report_id,auth.uid(),'admin_publish',jsonb_build_object('reason',p_reason));
end; $$;
revoke all on function public.admin_publish_report(uuid,text) from public, anon;
grant execute on function public.admin_publish_report(uuid,text) to authenticated;

-- Failed/empty detection routes to admins; detected boxes are seeded separately.
create function private.route_report_detection() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.status in ('failed','not_detected') then
  update public.reports set workflow_status = 'admin_review',review_started_at = coalesce(review_started_at,now())
   where id = new.report_id and published_at is null and workflow_status <> 'rejected';
 end if;
 return null;
end; $$;
revoke all on function private.route_report_detection() from public, anon, authenticated;
create trigger route_detection after insert or update on public.report_identifications
 for each row execute function private.route_report_detection();

-- Replace the broad public read policy: visibility alone is no longer publication.
drop policy "Read own or public reports" on public.reports;
create policy "Read report workflow" on public.reports for select to authenticated using (
 user_id = (select auth.uid()) or workflow_status = 'published' or (select private.is_report_admin())
 or (workflow_status = 'pending_review' and (select private.is_active_reviewer()))
);
drop policy "Read visible report photos" on storage.objects;
create policy "Read workflow report photos" on storage.objects for select to authenticated using (
 bucket_id = 'report-photos' and (
  (owner_id = (select auth.uid()::text) and (storage.foldername(name))[1] = (select auth.uid()::text))
  or exists(select 1 from public.reports r where r.photo_path = name)
 )
);

-- Old queue shape stays available, but only the future per-insect workflow counts.
-- Votes cast through the legacy shadow RPC cannot grant credit.
create or replace view public.report_verification_queue with (security_invoker = true) as
 select r.* from public.reports r where r.workflow_status in ('pending_review','published')
 and r.user_id <> auth.uid() and private.is_active_reviewer()
 and exists(select 1 from public.report_insects i where i.report_id = r.id and i.active and i.label = 'pending');
create view public.report_admin_queue with (security_invoker = true) as
 select r.* from public.reports r where private.is_report_admin() and
 (r.workflow_status = 'admin_review' or (r.workflow_status in ('pending_review','published')
  and exists(select 1 from public.report_insects i where i.report_id = r.id and i.active and i.label = 'pending')
  and r.review_started_at <= now() - interval '48 hours'));
revoke all on public.report_admin_queue from public, anon, authenticated, service_role;
grant select on public.report_admin_queue to authenticated,service_role;

-- Compatibility RPC name/columns for current leaderboard client, now REAL credit.
create or replace function public.get_raw_upload_leaderboard(p_period text)
returns table(display_name text,verified_kills bigint)
language plpgsql security definer set search_path = '' as $$
declare period_start timestamptz;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
 if p_period = 'weekly' then period_start := date_trunc('week',now());
 elsif p_period = 'monthly' then period_start := date_trunc('month',now());
 else raise exception 'Period must be weekly or monthly' using errcode = '22023'; end if;
 return query select coalesce(cp.display_name,'Field member'),sum(c.dead_insects)::bigint
 from public.report_kill_credits c join public.reports r on r.id = c.report_id
 left join public.community_profiles cp on cp.user_id = c.user_id
 where r.workflow_status = 'published' and r.published_at >= period_start
 group by c.user_id,cp.display_name having sum(c.dead_insects) > 0
 order by sum(c.dead_insects) desc,coalesce(cp.display_name,'Field member'),c.user_id;
end; $$;

-- Social votes/flags are for the published feed, never verification evidence.
drop policy "Vote on public reports" on public.report_votes;
drop policy "Change own vote" on public.report_votes;
drop policy "Flag public reports" on public.report_flags;
create policy "Vote on published reports" on public.report_votes for insert to authenticated
 with check (voter_id = (select auth.uid()) and exists(select 1 from public.reports r
  where r.id = report_id and r.workflow_status = 'published' and r.user_id <> (select auth.uid())));
create policy "Change published vote" on public.report_votes for update to authenticated
 using (voter_id = (select auth.uid()))
 with check (voter_id = (select auth.uid()) and exists(select 1 from public.reports r
  where r.id = report_id and r.workflow_status = 'published' and r.user_id <> (select auth.uid())));
create policy "Flag published reports" on public.report_flags for insert to authenticated
 with check (flagger_id = (select auth.uid()) and exists(select 1 from public.reports r
  where r.id = report_id and r.workflow_status = 'published' and r.user_id <> (select auth.uid())));
