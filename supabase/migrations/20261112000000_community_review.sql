-- Authoritative per-insect, per-revision review. Legacy biological/social votes
-- are intentionally not imported. Every mutation serializes on its report.
create table public.insect_review_votes (
 insect_id uuid not null references public.report_insects(id) on delete cascade,
 revision integer not null check(revision>0),
 report_id uuid not null references public.reports(id) on delete cascade,
 reviewer_id uuid not null references auth.users(id) on delete cascade,
 label text not null check(label in ('alive','dead','uncertain')),
 updated_at timestamptz not null default now(),
 primary key(insect_id,revision,reviewer_id)
);
create index insect_votes_report_idx on public.insect_review_votes(report_id);
alter table public.insect_review_votes enable row level security;
revoke all on public.insect_review_votes from public,anon,authenticated,service_role;
grant select on public.insect_review_votes to authenticated,service_role;
create policy "Read only own review labels" on public.insect_review_votes for select to authenticated
 using(reviewer_id=auth.uid() and exists(select 1 from public.reports r where r.id=report_id));

create table public.insect_review_claims (
 insect_id uuid not null references public.report_insects(id) on delete cascade,
 revision integer not null check(revision>0),
 reviewer_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null,
 primary key(insect_id,revision,reviewer_id)
);
alter table public.insect_review_claims enable row level security;
revoke all on public.insect_review_claims from public,anon,authenticated,service_role;
-- Claimed reservations and other reviewers' identities are never exposed.
grant select on public.insect_review_claims to service_role;

create function private.review_slot_available(p_insect_id uuid,p_revision integer) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.insect_review_votes v where v.insect_id=p_insect_id
   and v.revision=p_revision and v.reviewer_id=auth.uid() and v.label in ('alive','dead'))
 or exists(select 1 from public.insect_review_claims c where c.insect_id=p_insect_id
   and c.revision=p_revision and c.reviewer_id=auth.uid() and c.expires_at>now())
 or ((select count(*) from public.insect_review_votes v where v.insect_id=p_insect_id
   and v.revision=p_revision and v.label in ('alive','dead'))
  +(select count(*) from public.insect_review_claims c where c.insect_id=p_insect_id
   and c.revision=p_revision and c.expires_at>now() and not exists(
    select 1 from public.insect_review_votes v where v.insect_id=c.insect_id and v.revision=c.revision
     and v.reviewer_id=c.reviewer_id and v.label in ('alive','dead'))))<5;
$$;
revoke all on function private.review_slot_available(uuid,integer) from public,anon;
grant execute on function private.review_slot_available(uuid,integer) to authenticated,service_role;

create function private.lock_review_report(p_report_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.reports;
begin
 select * into r from public.reports where id=p_report_id for update;
 if not found or auth.uid() is null or r.user_id=auth.uid() or not private.is_active_reviewer()
  or r.workflow_status not in ('pending_review','published') then raise exception 'Review unavailable'; end if;
end; $$;
revoke all on function private.lock_review_report(uuid) from public,anon,authenticated;

create function public.get_report_review(p_report_id uuid)
returns table(insect_id uuid,revision integer,box jsonb,final_label text,my_vote text,can_vote boolean,feedback jsonb)
language plpgsql security definer set search_path='' as $$
begin
 -- Read-only snapshot: no claim renewal during polling.
 if auth.uid() is null or not private.is_active_reviewer() or not exists(select 1 from public.reports r
  where r.id=p_report_id and r.user_id<>auth.uid() and r.workflow_status in ('pending_review','published')) then
  raise exception 'Review unavailable'; end if;
 return query select i.id,i.revision,i.box,nullif(i.label,'pending'),v.label,
  i.label='pending' and (v.label in ('alive','dead') or exists(select 1 from public.insect_review_claims c
   where c.insect_id=i.id and c.revision=i.revision and c.reviewer_id=auth.uid() and c.expires_at>now())) is true,
  case when v.label is not null then (select jsonb_build_object(
   'alive_votes',count(*) filter(where all_votes.label='alive'),
   'dead_votes',count(*) filter(where all_votes.label='dead'),
   'uncertain_votes',count(*) filter(where all_votes.label='uncertain'),'model_score',i.model_score)
   from public.insect_review_votes all_votes where all_votes.insect_id=i.id and all_votes.revision=i.revision) end
 from public.report_insects i left join public.insect_review_votes v
  on v.insect_id=i.id and v.revision=i.revision and v.reviewer_id=auth.uid()
 where i.report_id=p_report_id and i.active order by i.id;
end; $$;
revoke all on function public.get_report_review(uuid) from public,anon;
grant execute on function public.get_report_review(uuid) to authenticated;

create function public.claim_report_review(p_report_id uuid)
returns table(insect_id uuid,revision integer,box jsonb,final_label text,my_vote text,can_vote boolean,feedback jsonb)
language plpgsql security definer set search_path='' as $$
declare insect public.report_insects;
begin
 perform private.lock_review_report(p_report_id);
 for insect in select * from public.report_insects where report_id=p_report_id and active and label='pending' order by id loop
  if private.review_slot_available(insect.id,insect.revision) and not exists(
   select 1 from public.insect_review_votes v where v.insect_id=insect.id and v.revision=insect.revision
    and v.reviewer_id=auth.uid() and v.label in ('alive','dead')) then
   insert into public.insect_review_claims(insect_id,revision,reviewer_id,expires_at)
   values(insect.id,insect.revision,auth.uid(),now()+interval '15 minutes')
   on conflict on constraint insect_review_claims_pkey do update set expires_at=excluded.expires_at;
  end if;
 end loop;
 return query select * from public.get_report_review(p_report_id);
end; $$;
revoke all on function public.claim_report_review(uuid) from public,anon;
grant execute on function public.claim_report_review(uuid) to authenticated;

create function public.release_report_review(p_report_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 perform 1 from public.reports where id=p_report_id for update;
 delete from public.insect_review_claims c using public.report_insects i
 where c.insect_id=i.id and i.report_id=p_report_id and c.reviewer_id=auth.uid();
end; $$;
revoke all on function public.release_report_review(uuid) from public,anon;
grant execute on function public.release_report_review(uuid) to authenticated;

create function public.set_insect_review_vote(p_insect_id uuid,p_revision integer,p_label text) returns void
language plpgsql security definer set search_path='' as $$
declare insect public.report_insects; rid uuid; previous text; winner text;
begin
 select report_id into rid from public.report_insects where id=p_insect_id;
 perform private.lock_review_report(rid);
 select * into insect from public.report_insects where id=p_insect_id;
 if not found or not insect.active or insect.revision<>p_revision or p_revision is null or insect.label<>'pending' then
  raise exception 'Insect changed or decision already final'; end if;
 if p_label is not null and p_label not in ('alive','dead','uncertain') then raise exception 'Invalid label'; end if;
 select label into previous from public.insect_review_votes where insect_id=p_insect_id
  and revision=p_revision and reviewer_id=auth.uid();
 -- Vote changes for an existing decisive reviewer retain their seat. Otherwise
 -- a live claim is required; the UI cannot bypass the five-person panel.
 if p_label is not null and coalesce(previous,'') not in ('alive','dead') and not exists(
  select 1 from public.insect_review_claims where insect_id=p_insect_id and revision=p_revision
   and reviewer_id=auth.uid() and expires_at>now()) then raise exception 'Claim a review slot first'; end if;
 if p_label is null then
  delete from public.insect_review_votes where insect_id=p_insect_id and revision=p_revision and reviewer_id=auth.uid();
 else
  insert into public.insect_review_votes(insect_id,revision,report_id,reviewer_id,label)
  values(p_insect_id,p_revision,rid,auth.uid(),p_label)
  on conflict(insect_id,revision,reviewer_id) do update set label=excluded.label,updated_at=now();
 end if;
 -- Uncertain, removed, and decisive labels all release the temporary reservation;
 -- decisive labels themselves retain a panel seat until finalization or removal.
 delete from public.insect_review_claims where insect_id=p_insect_id and revision=p_revision and reviewer_id=auth.uid();
 select label into winner from public.insect_review_votes where insect_id=p_insect_id
  and revision=p_revision and label in ('alive','dead') group by label having count(*)>=3;
 if winner is not null then
  update public.report_insects set label=winner,decision_source='community',decided_at=now(),
   reason='Three matching labels from distinct eligible reviewers' where id=p_insect_id;
  delete from public.insect_review_claims where insect_id=p_insect_id and revision=p_revision;
 end if;
end; $$;
revoke all on function public.set_insect_review_vote(uuid,integer,text) from public,anon;
grant execute on function public.set_insect_review_vote(uuid,integer,text) to authenticated;

-- Aggregates become visible only AFTER submitting your own label for this
-- revision. No names/identities and no unsubmitted-revision machine scores.
create function public.get_insect_review_feedback(p_insect_id uuid,p_revision integer)
returns table(alive_votes bigint,dead_votes bigint,uncertain_votes bigint,model_score double precision)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.report_insects i join public.reports r on r.id=i.report_id
  where i.id=p_insect_id and i.revision=p_revision and i.active and r.workflow_status<>'rejected'
   and (r.user_id=auth.uid() or r.workflow_status='published' or private.is_active_reviewer()))
  or not exists(select 1 from public.insect_review_votes where insect_id=p_insect_id and revision=p_revision and reviewer_id=auth.uid()) then
  raise exception 'Submit your own label before viewing feedback'; end if;
 return query select count(*) filter(where v.label='alive'),count(*) filter(where v.label='dead'),
  count(*) filter(where v.label='uncertain'),(select i.model_score from public.report_insects i where i.id=p_insect_id)
 from public.insect_review_votes v where v.insect_id=p_insect_id and v.revision=p_revision;
end; $$;
revoke all on function public.get_insect_review_feedback(uuid,integer) from public,anon;
grant execute on function public.get_insect_review_feedback(uuid,integer) to authenticated;

create function private.audit_insect_review_vote() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.report_audit_log(report_id,insect_id,actor_id,action,old_data,new_data)
 values(coalesce(new.report_id,old.report_id),coalesce(new.insect_id,old.insect_id),auth.uid(),'review_vote:'||tg_op,
  case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return null;
end; $$;
revoke all on function private.audit_insect_review_vote() from public,anon,authenticated;
create trigger audit_review_vote after insert or update or delete on public.insect_review_votes
 for each row execute function private.audit_insect_review_vote();

-- The trusted inference endpoint can finalize MODEL decisions only. Community
-- decisions now come exclusively from the database quorum above.
create or replace function public.record_report_insect_decision(p_insect_id uuid,p_revision integer,
 p_label text,p_source text,p_reason text,p_model_sha256 text default null,p_model_score double precision default null)
returns void language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 if p_source is distinct from 'model' or p_label is distinct from 'dead'
  or p_reason is null or char_length(btrim(p_reason))=0 then raise exception 'Use database quorum for community decisions'; end if;
 select report_id into rid from public.report_insects where id=p_insect_id;
 perform 1 from public.reports where id=rid for update;
 update public.report_insects set label=p_label,decision_source=p_source,reason=p_reason,decided_at=now(),
  model_sha256=p_model_sha256,model_score=p_model_score
 where id=p_insect_id and revision=p_revision and active and label='pending';
 if not found then raise exception 'Insect missing, revision changed, or decision already final'; end if;
end; $$;

create or replace view public.report_verification_queue with (security_invoker=true) as
 select r.* from public.reports r where r.workflow_status in ('pending_review','published')
 and r.user_id<>auth.uid() and private.is_active_reviewer()
 and exists(select 1 from public.report_insects i where i.report_id=r.id and i.active and i.label='pending'
  and (private.review_slot_available(i.id,i.revision) or exists(select 1 from public.insect_review_votes v
   where v.insect_id=i.id and v.revision=i.revision and v.reviewer_id=auth.uid())));
-- Existing report_admin_queue includes unresolved reviews after 48 hours,
-- including correction reviews on already-published posts. No scheduler required.
