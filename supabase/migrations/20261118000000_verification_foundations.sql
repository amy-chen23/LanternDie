-- Milestone 1 ONLY. New shadow tables/RPCs; no live labels, policies, votes,
-- snapshots, leaderboard functions, jobs, or existing RLS policies are changed.
-- Apply through the normal migration transaction. No hosted deployment in M1.
create table public.verification_engine_settings (
 singleton boolean primary key default true check(singleton),
 live_enabled boolean not null default false check(not live_enabled),
 created_at timestamptz not null default now()
);
insert into public.verification_engine_settings(singleton) values(true);

create table public.verification_policies (
 id uuid primary key default gen_random_uuid(),
 version text not null unique check(char_length(version) between 1 and 120),
 detection_accept_min double precision check(detection_accept_min between 0 and 1),
 detection_review_min double precision check(detection_review_min between 0 and 1),
 high_alive_max double precision check(high_alive_max between 0 and 1),
 medium_alive_max double precision check(medium_alive_max between 0 and 1),
 medium_dead_min double precision check(medium_dead_min between 0 and 1),
 high_dead_min double precision check(high_dead_min between 0 and 1),
 review_seats integer not null default 5 check(review_seats between 1 and 100),
 matching_votes integer not null default 3 check(matching_votes>0 and matching_votes<=review_seats),
 review_window_seconds integer not null default 86400 check(review_window_seconds between 1 and 2592000),
 auto_acceptance_enabled boolean not null default false,
 calibration_approved_at timestamptz,
 calibration_approved_by uuid,
 calibration_reference text,
 created_at timestamptz not null default now(),
 check(detection_review_min is null or detection_accept_min is null or detection_review_min<=detection_accept_min),
 check((high_alive_max is null and medium_alive_max is null and medium_dead_min is null and high_dead_min is null)
   or (high_alive_max is not null and medium_alive_max is not null and medium_dead_min is not null and high_dead_min is not null
    and high_alive_max<=medium_alive_max and medium_alive_max<medium_dead_min and medium_dead_min<=high_dead_min)),
 check(not auto_acceptance_enabled or (high_alive_max is not null and medium_alive_max is not null
   and medium_dead_min is not null and high_dead_min is not null and detection_accept_min is not null
   and detection_review_min is not null and calibration_approved_at is not null and calibration_approved_by is not null
   and nullif(btrim(calibration_reference),'') is not null))
);
insert into public.verification_policies(version) values('shadow-foundation-v1');

-- Snapshot IDs deliberately have no cascading FK to legacy reports/insects.
-- Like report_audit_log, evidence must not block existing account/report deletion.
-- Inserts validate against live geometry; all later references use this immutable
-- (insect_id, box_revision) identity, which survives a box correction/deletion.
create table public.verification_insect_revisions (
 insect_id uuid not null,
 box_revision integer not null check(box_revision>0),
 report_id uuid not null,
 box jsonb not null check(jsonb_typeof(box)='object'),
 active boolean not null,
 recorded_at timestamptz not null default now(),
 primary key(insect_id,box_revision),
 unique(insect_id,box_revision,report_id)
);

create table public.insect_verifications (
 insect_id uuid not null,
 box_revision integer not null,
 report_id uuid not null,
 status text not null default 'PENDING' check(status in ('PENDING','AI_CLASSIFIED','PROVISIONAL','COMMUNITY_REVIEW','CONTESTED','VERIFIED','INCONCLUSIVE','REJECTED')),
 accepted_life_status text check(accepted_life_status in ('ALIVE','DEAD')),
 verification_method text check(verification_method in ('model','community','admin','system','legacy')),
 policy_id uuid not null references public.verification_policies(id),
 decision_version integer not null default 0 check(decision_version>=0),
 provisionally_accepted_at timestamptz,
 finalization_deadline timestamptz,
 finalized_at timestamptz,
 hold_reason text,
 shadow_only boolean not null default true check(shadow_only),
 updated_at timestamptz not null default now(),
 primary key(insect_id,box_revision),
 foreign key(insect_id,box_revision,report_id) references public.verification_insect_revisions(insect_id,box_revision,report_id),
 check(status not in ('PROVISIONAL','VERIFIED') or (accepted_life_status is not null and verification_method is not null)),
 check(status not in ('PENDING','AI_CLASSIFIED','COMMUNITY_REVIEW','INCONCLUSIVE','REJECTED') or accepted_life_status is null),
 check((provisionally_accepted_at is null)=(finalization_deadline is null)),
 check(finalization_deadline is null or finalization_deadline>provisionally_accepted_at),
 check(status<>'PROVISIONAL' or provisionally_accepted_at is not null),
 check((status='VERIFIED')=(finalized_at is not null))
);

create table public.insect_model_predictions (
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null,
 insect_id uuid not null,
 box_revision integer not null,
 predicted_life_status text check(predicted_life_status in ('ALIVE','DEAD')),
 raw_dead_score double precision not null check(raw_dead_score between 0 and 1),
 model_sha256 text not null references public.death_model_versions(sha256),
 model_version text not null,
 preprocessing_version text not null,
 provenance text not null check(provenance in ('browser_untrusted','server_trusted')),
 inference_runtime text not null check(char_length(inference_runtime) between 1 and 120),
 runtime_version text not null check(char_length(runtime_version) between 1 and 120),
 source_image_sha256 text check(source_image_sha256 ~ '^[a-f0-9]{64}$'),
 inference_at timestamptz not null,
 recorded_at timestamptz not null default now(),
 recorded_by uuid,
 idempotency_key text not null unique check(char_length(idempotency_key) between 1 and 200),
 foreign key(insect_id,box_revision,report_id) references public.verification_insect_revisions(insect_id,box_revision,report_id),
 check(provenance<>'server_trusted' or source_image_sha256 is not null)
);
create index insect_predictions_revision_idx on public.insect_model_predictions(insect_id,box_revision,recorded_at desc);

create table public.verification_decisions (
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null,
 insect_id uuid not null,
 box_revision integer not null,
 decision_version integer not null check(decision_version>0),
 from_status text not null,
 to_status text not null,
 accepted_life_status text check(accepted_life_status in ('ALIVE','DEAD')),
 method text not null check(method in ('model','community','admin','system')),
 policy_id uuid not null references public.verification_policies(id),
 prediction_id uuid references public.insect_model_predictions(id),
 reason text not null check(char_length(btrim(reason)) between 1 and 1000),
 idempotency_key text not null unique check(char_length(idempotency_key) between 1 and 200),
 shadow_only boolean not null default true check(shadow_only),
 created_at timestamptz not null default now(),
 unique(insect_id,box_revision,decision_version),
 foreign key(insect_id,box_revision,report_id) references public.verification_insect_revisions(insect_id,box_revision,report_id)
);

-- No contest submission/resolution RPCs in M1. These are reserved permission and
-- schema boundaries, not a formal contest processing implementation.
create table public.verification_contests (
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null,
 insect_id uuid,
 box_revision integer,
 scope text not null check(scope in ('report','insect')),
 reason_code text not null check(reason_code in ('detection_error','incorrect_box','life_status','insufficient_evidence','duplicate','fraud')),
 reason text not null check(char_length(btrim(reason)) between 1 and 2000),
 opened_by uuid not null,
 evidence_path text,
 status text not null default 'SUBMITTED' check(status in ('SUBMITTED','QUALIFIED','RESOLVED','DISMISSED')),
 qualified_at timestamptz,
 resolved_at timestamptz,
 resolution text check(resolution in ('UPHELD','OVERTURNED','REJECTED','INCONCLUSIVE')),
 resolved_by uuid,
 decision_id uuid references public.verification_decisions(id),
 created_at timestamptz not null default now(),
 check((scope='report' and insect_id is null and box_revision is null)
   or (scope='insect' and insect_id is not null and box_revision is not null)),
 foreign key(insect_id,box_revision,report_id) references public.verification_insect_revisions(insect_id,box_revision,report_id),
 check((status='QUALIFIED')=(qualified_at is not null and resolved_at is null)),
 check((status in ('RESOLVED','DISMISSED'))=(resolved_at is not null)),
 check(status<>'RESOLVED' or (resolution is not null and resolved_by is not null))
);
create unique index one_open_insect_contest_per_author on public.verification_contests(insect_id,box_revision,opened_by,reason_code)
 where scope='insect' and status in ('SUBMITTED','QUALIFIED');
create unique index one_open_report_contest_per_author on public.verification_contests(report_id,opened_by,reason_code)
 where scope='report' and status in ('SUBMITTED','QUALIFIED');
create index qualified_contests_idx on public.verification_contests(report_id,insect_id) where status='QUALIFIED';

create table public.insect_credit_accounts (
 id uuid primary key default gen_random_uuid(),
 insect_id uuid not null unique,
 report_id uuid not null,
 status text not null default 'NONE' check(status in ('NONE','PROVISIONAL','HELD','FINALIZED','REVERSED')),
 event_version integer not null default 0 check(event_version>=0),
 shadow_only boolean not null default true check(shadow_only),
 updated_at timestamptz not null default now()
);
create table public.insect_credit_events (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.insect_credit_accounts(id),
 source_decision_id uuid not null references public.verification_decisions(id),
 event_version integer not null check(event_version>0),
 from_status text not null check(from_status in ('NONE','PROVISIONAL','HELD','FINALIZED','REVERSED')),
 to_status text not null check(to_status in ('PROVISIONAL','HELD','FINALIZED','REVERSED')),
 amount integer not null check(amount=1),
 balance_delta integer not null check(balance_delta between -1 and 1),
 idempotency_key text not null unique check(char_length(idempotency_key) between 1 and 200),
 reason text not null check(char_length(btrim(reason)) between 1 and 1000),
 shadow_only boolean not null default true check(shadow_only),
 created_at timestamptz not null default now(),
 unique(account_id,event_version)
);

-- Match Supabase's broad default privileges explicitly: service_role is not
-- exempt from table privileges. All writes go through restricted definer RPCs.
do $$ declare name text; begin
 foreach name in array array['verification_engine_settings','verification_policies','verification_insect_revisions',
  'insect_verifications','insect_model_predictions','verification_decisions','verification_contests','insect_credit_accounts','insect_credit_events'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);
  execute format('grant select on public.%I to service_role',name);
 end loop;
end $$;
grant select(id,version,detection_accept_min,detection_review_min,high_alive_max,medium_alive_max,medium_dead_min,high_dead_min,
 review_seats,matching_votes,review_window_seconds,auto_acceptance_enabled,calibration_approved_at,created_at)
 on public.verification_policies to authenticated;
grant select on public.verification_engine_settings,public.insect_verifications,
 public.insect_model_predictions,public.verification_decisions to authenticated;
create policy "Read verification policy" on public.verification_policies for select to authenticated using(true);
create policy "Read shadow feature flag" on public.verification_engine_settings for select to authenticated using(true);
create policy "Read verification for accessible report" on public.insect_verifications for select to authenticated
 using(exists(select 1 from public.reports r where r.id=report_id));
create policy "Owner or admin reads model predictions" on public.insect_model_predictions for select to authenticated
 using(exists(select 1 from public.reports r where r.id=report_id and r.user_id=auth.uid()) or private.is_report_admin());
create policy "Owner or admin reads shadow decisions" on public.verification_decisions for select to authenticated
 using(exists(select 1 from public.reports r where r.id=report_id and r.user_id=auth.uid()) or private.is_report_admin());

create function private.immutable_verification_evidence() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Verification evidence is append-only'; end; $$;
revoke all on function private.immutable_verification_evidence() from public,anon,authenticated,service_role;
create trigger immutable_revision before update or delete on public.verification_insect_revisions
 for each row execute function private.immutable_verification_evidence();
create trigger immutable_prediction before update or delete on public.insect_model_predictions
 for each row execute function private.immutable_verification_evidence();
create trigger immutable_decision before update or delete on public.verification_decisions
 for each row execute function private.immutable_verification_evidence();
create trigger immutable_credit_event before update or delete on public.insect_credit_events
 for each row execute function private.immutable_verification_evidence();
create trigger immutable_verification_policy before update or delete on public.verification_policies
 for each row execute function private.immutable_verification_evidence();

create function private.verification_transition_allowed(p_from text,p_to text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(p_to=any(case p_from
  when 'PENDING' then array['AI_CLASSIFIED','COMMUNITY_REVIEW','INCONCLUSIVE','REJECTED']
  when 'AI_CLASSIFIED' then array['PROVISIONAL','COMMUNITY_REVIEW','INCONCLUSIVE','REJECTED']
  when 'PROVISIONAL' then array['VERIFIED','CONTESTED','INCONCLUSIVE','REJECTED']
  when 'COMMUNITY_REVIEW' then array['PROVISIONAL','CONTESTED','INCONCLUSIVE','REJECTED']
  when 'CONTESTED' then array['PROVISIONAL','VERIFIED','INCONCLUSIVE','REJECTED']
  when 'VERIFIED' then array['CONTESTED']
  when 'INCONCLUSIVE' then array['AI_CLASSIFIED','COMMUNITY_REVIEW','REJECTED']
  when 'REJECTED' then array['CONTESTED','COMMUNITY_REVIEW']
  else array[]::text[] end),false);
$$;
revoke all on function private.verification_transition_allowed(text,text) from public,anon,authenticated;

create function private.capture_verification_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare policy uuid; begin
 select id into policy from public.verification_policies where version='shadow-foundation-v1';
 insert into public.verification_insect_revisions(insect_id,box_revision,report_id,box,active)
 values(new.id,new.revision,new.report_id,new.box,new.active) on conflict do nothing;
 insert into public.insect_verifications(insect_id,box_revision,report_id,policy_id)
 values(new.id,new.revision,new.report_id,policy) on conflict do nothing;
 return null;
end; $$;
revoke all on function private.capture_verification_revision() from public,anon,authenticated,service_role;
create trigger capture_verification_revision after insert or update of box,revision,active on public.report_insects
 for each row execute function private.capture_verification_revision();
-- Backfill NEW shadow tables only. No label, vote, credit, or legacy audit writes.
insert into public.verification_insect_revisions(insect_id,box_revision,report_id,box,active)
 select id,revision,report_id,box,active from public.report_insects;
insert into public.insect_verifications(insect_id,box_revision,report_id,status,accepted_life_status,
 verification_method,policy_id,finalized_at)
 select i.id,i.revision,i.report_id,case when i.label='pending' then 'PENDING' else 'VERIFIED' end,
 case when i.label='pending' then null else upper(i.label) end,
 case when i.label='pending' then null else 'legacy' end,p.id,
 case when i.label='pending' then null else coalesce(i.decided_at,i.updated_at) end
 from public.report_insects i cross join public.verification_policies p where p.version='shadow-foundation-v1';

create function private.record_model_prediction(p_insect_id uuid,p_revision integer,p_model_sha256 text,
 p_raw_dead_score double precision,p_predicted_life_status text,p_runtime text,p_runtime_version text,
 p_inference_at timestamptz,p_image_sha256 text,p_key text,p_trusted boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare insect public.report_insects; model public.death_model_versions; prior public.insect_model_predictions;
 rid uuid; result uuid; owner uuid; begin
 select report_id into rid from public.report_insects where id=p_insect_id;
 select user_id into owner from public.reports where id=rid for share;
 select * into insect from public.report_insects where id=p_insect_id for share;
 if not found or not insect.active or insect.revision is distinct from p_revision then raise exception 'Insect revision is stale or missing'; end if;
 if not p_trusted and owner is distinct from auth.uid() then raise exception 'Report owner required'; end if;
 select * into model from public.death_model_versions where sha256=p_model_sha256;
 if not found then raise exception 'Unregistered model'; end if;
 if p_trusted and not exists(select 1 from public.report_photo_hashes where report_id=rid and sha256=p_image_sha256)
 then raise exception 'Trusted inference requires the registered photo hash'; end if;
 -- Namespacing prevents a browser observer from preempting a server event key.
 p_key := case when p_trusted then 'server:' else 'browser:'||auth.uid()::text||':' end||p_key;
 insert into public.insect_model_predictions(report_id,insect_id,box_revision,predicted_life_status,raw_dead_score,
 model_sha256,model_version,preprocessing_version,provenance,inference_runtime,runtime_version,
 source_image_sha256,inference_at,recorded_by,idempotency_key)
 values(rid,p_insect_id,p_revision,p_predicted_life_status,p_raw_dead_score,p_model_sha256,model.version,model.preprocessing_version,
 case when p_trusted then 'server_trusted' else 'browser_untrusted' end,p_runtime,p_runtime_version,p_image_sha256,
 p_inference_at,case when p_trusted then null else auth.uid() end,p_key)
 on conflict(idempotency_key) do nothing returning id into result;
 if result is not null then return result; end if;
 select * into prior from public.insect_model_predictions where idempotency_key=p_key;
 if (prior.insect_id,prior.box_revision,prior.model_sha256,prior.raw_dead_score,prior.predicted_life_status,
  prior.inference_runtime,prior.runtime_version,prior.source_image_sha256,prior.inference_at)
  is distinct from (p_insect_id,p_revision,p_model_sha256,p_raw_dead_score,p_predicted_life_status,p_runtime,p_runtime_version,p_image_sha256,p_inference_at)
 then raise exception 'Prediction idempotency key conflicts with different evidence'; end if;
 return prior.id;
end; $$;
revoke all on function private.record_model_prediction(uuid,integer,text,double precision,text,text,text,timestamptz,text,text,boolean)
 from public,anon,authenticated,service_role;

create function public.record_browser_model_observation(p_insect_id uuid,p_revision integer,p_model_sha256 text,
 p_raw_dead_score double precision,p_predicted_life_status text,p_runtime_version text,p_inference_at timestamptz,p_key text)
returns uuid language sql security definer set search_path='' as $$
 select private.record_model_prediction(p_insect_id,p_revision,p_model_sha256,p_raw_dead_score,p_predicted_life_status,
 'browser',p_runtime_version,p_inference_at,null,p_key,false);
$$;
revoke all on function public.record_browser_model_observation(uuid,integer,text,double precision,text,text,timestamptz,text) from public,anon,service_role;
grant execute on function public.record_browser_model_observation(uuid,integer,text,double precision,text,text,timestamptz,text) to authenticated;

create function public.record_trusted_model_prediction(p_insect_id uuid,p_revision integer,p_model_sha256 text,
 p_raw_dead_score double precision,p_predicted_life_status text,p_runtime text,p_runtime_version text,
 p_inference_at timestamptz,p_image_sha256 text,p_key text)
returns uuid language sql security definer set search_path='' as $$
 select private.record_model_prediction(p_insect_id,p_revision,p_model_sha256,p_raw_dead_score,p_predicted_life_status,
 p_runtime,p_runtime_version,p_inference_at,p_image_sha256,p_key,true);
$$;
revoke all on function public.record_trusted_model_prediction(uuid,integer,text,double precision,text,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.record_trusted_model_prediction(uuid,integer,text,double precision,text,text,text,timestamptz,text,text) to service_role;

alter table public.verification_decisions add constraint valid_shadow_transition
 check(private.verification_transition_allowed(from_status,to_status));

create function public.transition_shadow_verification(p_insect_id uuid,p_revision integer,p_expected_version integer,
 p_to text,p_life_status text,p_method text,p_policy_id uuid,p_prediction_id uuid,p_reason text,p_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare state public.insect_verifications; policy public.verification_policies;
 prediction public.insect_model_predictions; prior public.verification_decisions;
 rid uuid; result uuid; accepted_at timestamptz; deadline timestamptz; begin
 -- Same report-first locking convention as the legacy worker and moderator.
 select report_id into rid from public.report_insects where id=p_insect_id;
 perform 1 from public.reports where id=rid for share;
 perform 1 from public.report_insects where id=p_insect_id and revision=p_revision and active for share;
 if not found then raise exception 'Insect revision is stale or missing'; end if;
 select * into state from public.insect_verifications where insect_id=p_insect_id and box_revision=p_revision for update;
 if not found then raise exception 'Verification snapshot missing'; end if;
 select * into prior from public.verification_decisions where idempotency_key=p_key;
 if found then
  if (prior.insect_id,prior.box_revision,prior.decision_version,prior.to_status,prior.accepted_life_status,
   prior.method,prior.policy_id,prior.prediction_id,prior.reason) is distinct from
   (p_insect_id,p_revision,p_expected_version+1,p_to,p_life_status,p_method,p_policy_id,p_prediction_id,p_reason)
  then raise exception 'Decision idempotency key conflicts'; end if;
  return prior.id;
 end if;
 if state.decision_version is distinct from p_expected_version then raise exception 'Decision version changed'; end if;
 if not private.verification_transition_allowed(state.status,p_to) then raise exception 'Invalid verification transition: % -> %',state.status,p_to; end if;
 select * into policy from public.verification_policies where id=p_policy_id;
 if not found then raise exception 'Unknown verification policy'; end if;
 if p_method is null or p_method not in ('model','admin','system','community') then raise exception 'Invalid verification method'; end if;
 if p_method='community' then raise exception 'Community evidence integration is not enabled in milestone 1'; end if;
 if p_method='system' and (p_to<>'VERIFIED' or state.status<>'PROVISIONAL'
    or state.finalization_deadline>clock_timestamp() or state.accepted_life_status is distinct from p_life_status)
 then raise exception 'System finalization requires an expired provisional window'; end if;
 if p_method='system' and (p_policy_id is distinct from state.policy_id or p_prediction_id is distinct from
  (select prediction_id from public.verification_decisions where insect_id=p_insect_id and box_revision=p_revision
   and decision_version=state.decision_version))
 then raise exception 'System finalization must retain accepted policy and evidence'; end if;
 if p_to in ('PROVISIONAL','VERIFIED') and (state.hold_reason is not null or exists(
  select 1 from public.verification_contests c where c.report_id=rid and c.status='QUALIFIED'
   and ((c.scope='report' and c.reason_code in ('duplicate','fraud')) or (c.insect_id=p_insect_id and c.box_revision=p_revision))))
 then raise exception 'Verification has an active hold'; end if;
 if p_to in ('PROVISIONAL','VERIFIED') and p_life_status is null then raise exception 'Accepted life status required'; end if;
 if p_to in ('PENDING','AI_CLASSIFIED','COMMUNITY_REVIEW','INCONCLUSIVE','REJECTED') and p_life_status is not null
 then raise exception 'Unaccepted states cannot have accepted life status'; end if;
 if p_to='CONTESTED' and p_life_status is distinct from state.accepted_life_status
 then raise exception 'A contest must preserve the disputed accepted label'; end if;
 if p_prediction_id is not null then
  select * into prediction from public.insect_model_predictions where id=p_prediction_id;
  if not found or prediction.insect_id<>p_insect_id or prediction.box_revision<>p_revision
  then raise exception 'Prediction does not match insect revision'; end if;
 end if;
 if p_method='model' and p_prediction_id is null then raise exception 'Model evidence required'; end if;
 if p_method='model' and p_to in ('PROVISIONAL','VERIFIED') then
  if prediction.provenance is distinct from 'server_trusted' or prediction.predicted_life_status is distinct from p_life_status
  then raise exception 'Trusted matching model evidence required'; end if;
  if not policy.auto_acceptance_enabled then raise exception 'Automatic acceptance is disabled'; end if;
  if (p_life_status='DEAD' and prediction.raw_dead_score<policy.high_dead_min)
   or (p_life_status='ALIVE' and prediction.raw_dead_score>policy.high_alive_max)
  then raise exception 'Approved high confidence band not satisfied'; end if;
  if p_to='VERIFIED' then raise exception 'Model decisions must enter a provisional window first'; end if;
 end if;
 accepted_at := case when p_to='PROVISIONAL' then clock_timestamp() else state.provisionally_accepted_at end;
 deadline := case when p_to='PROVISIONAL' then accepted_at+make_interval(secs=>policy.review_window_seconds) else state.finalization_deadline end;
 -- A system finalization retains the actual acceptance method/evidence.
 insert into public.verification_decisions(report_id,insect_id,box_revision,decision_version,from_status,to_status,
 accepted_life_status,method,policy_id,prediction_id,reason,idempotency_key)
 values(rid,p_insect_id,p_revision,p_expected_version+1,state.status,p_to,p_life_status,p_method,p_policy_id,p_prediction_id,p_reason,p_key)
 returning id into result;
 update public.insect_verifications set status=p_to,accepted_life_status=p_life_status,
  verification_method=case when p_method='system' then state.verification_method else p_method end,
  policy_id=p_policy_id,decision_version=p_expected_version+1,
  provisionally_accepted_at=accepted_at,finalization_deadline=deadline,
  finalized_at=case when p_to='VERIFIED' then clock_timestamp() else null end,updated_at=clock_timestamp()
 where insect_id=p_insect_id and box_revision=p_revision;
 return result;
end; $$;
revoke all on function public.transition_shadow_verification(uuid,integer,integer,text,text,text,uuid,uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.transition_shadow_verification(uuid,integer,integer,text,text,text,uuid,uuid,text,text) to service_role;

create function public.record_shadow_credit_event(p_insect_id uuid,p_decision_id uuid,p_to text,p_key text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare decision public.verification_decisions; state public.insect_verifications;
 account public.insect_credit_accounts; prior public.insect_credit_events;
 prediction public.insect_model_predictions; rid uuid; result uuid; delta integer; begin
 select * into prior from public.insect_credit_events where idempotency_key=p_key;
 if found then
  if not exists(select 1 from public.insect_credit_accounts a where a.id=prior.account_id and a.insect_id=p_insect_id)
   or (prior.source_decision_id,prior.to_status,prior.reason) is distinct from (p_decision_id,p_to,p_reason)
  then raise exception 'Credit idempotency key conflicts'; end if;
  return prior.id;
 end if;
 select * into decision from public.verification_decisions where id=p_decision_id and insect_id=p_insect_id;
 if not found then raise exception 'Matching verification decision required'; end if;
 rid:=decision.report_id;
 perform 1 from public.reports where id=rid for share;
 perform 1 from public.report_insects where id=p_insect_id and revision=decision.box_revision and active for share;
 if not found then raise exception 'Insect revision is stale or missing'; end if;
 select * into state from public.insect_verifications where insect_id=p_insect_id and box_revision=decision.box_revision for share;
 if state.decision_version is distinct from decision.decision_version then raise exception 'Credit decision is stale'; end if;
 insert into public.insect_credit_accounts(insect_id,report_id) values(p_insect_id,rid) on conflict(insect_id) do nothing;
 select * into account from public.insect_credit_accounts where insect_id=p_insect_id for update;
 -- A concurrent retry may have committed while this transaction waited.
 select * into prior from public.insect_credit_events where idempotency_key=p_key;
 if found then
  if (prior.account_id,prior.source_decision_id,prior.to_status,prior.reason)
    is distinct from (account.id,p_decision_id,p_to,p_reason) then raise exception 'Credit idempotency key conflicts'; end if;
  return prior.id;
 end if;
 if not(case account.status
  when 'NONE' then p_to in ('PROVISIONAL','FINALIZED')
  when 'PROVISIONAL' then p_to in ('HELD','FINALIZED','REVERSED')
  when 'HELD' then p_to in ('PROVISIONAL','FINALIZED','REVERSED')
  when 'FINALIZED' then p_to in ('HELD','REVERSED')
  when 'REVERSED' then p_to in ('PROVISIONAL','FINALIZED') else false end)
 then raise exception 'Invalid credit transition'; end if;
 if p_to='PROVISIONAL' then
  select * into prediction from public.insect_model_predictions where id=decision.prediction_id;
  if state.status<>'PROVISIONAL' or state.accepted_life_status is distinct from 'DEAD'
   or prediction.provenance is distinct from 'server_trusted' or prediction.predicted_life_status is distinct from 'DEAD'
  then raise exception 'Provisional credit requires accepted trusted DEAD evidence'; end if;
 elsif p_to='FINALIZED' then
  if state.status<>'VERIFIED' or state.accepted_life_status is distinct from 'DEAD' or state.verification_method='legacy'
  then raise exception 'Finalized credit requires a new verified DEAD decision'; end if;
 elsif p_to='HELD' then
  if state.status<>'CONTESTED' and state.hold_reason is null then raise exception 'Credit hold requires contested verification'; end if;
 elsif p_to='REVERSED' then
  if state.status not in ('REJECTED','INCONCLUSIVE') and state.accepted_life_status is distinct from 'ALIVE'
  then raise exception 'Credit reversal requires a disqualifying decision'; end if;
 end if;
 if p_to in ('PROVISIONAL','FINALIZED') and (state.hold_reason is not null or exists(
  select 1 from public.verification_contests c where c.report_id=rid and c.status='QUALIFIED'
   and ((c.scope='report' and c.reason_code in ('duplicate','fraud')) or (c.insect_id=p_insect_id and c.box_revision=decision.box_revision))))
 then raise exception 'Credit has an active hold'; end if;
 delta:=(case when p_to in ('PROVISIONAL','FINALIZED') then 1 else 0 end)
  -(case when account.status in ('PROVISIONAL','FINALIZED') then 1 else 0 end);
 insert into public.insect_credit_events(account_id,source_decision_id,event_version,from_status,to_status,amount,balance_delta,idempotency_key,reason)
 values(account.id,p_decision_id,account.event_version+1,account.status,p_to,1,delta,p_key,p_reason) returning id into result;
 update public.insect_credit_accounts set status=p_to,event_version=event_version+1,updated_at=clock_timestamp() where id=account.id;
 return result;
end; $$;
revoke all on function public.record_shadow_credit_event(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_shadow_credit_event(uuid,uuid,text,text,text) to service_role;

comment on table public.insect_credit_accounts is 'Shadow-only per-insect identities. Not read by the live leaderboard; no historical credit backfill.';
comment on table public.verification_contests is 'M1 schema/permission boundary only. No submission, qualification, evidence-serving, or resolution API enabled.';
comment on table public.insect_verifications is 'Independent shadow verification snapshots. Legacy labels/votes/moderation remain authoritative in M1.';
