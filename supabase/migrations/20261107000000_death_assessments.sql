-- Device scores are untrusted shadow observations, never server verification.
create table public.death_model_versions (
  sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  version text not null unique,
  threshold double precision not null check (threshold between 0 and 1),
  preprocessing_version text not null,
  created_at timestamptz not null default now()
);
insert into public.death_model_versions (sha256, version, threshold, preprocessing_version) values
 ('57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d', 'lanternfly-dead-v1', 0.98, 'padded-rgb-pillow-bilinear-v1');
alter table public.death_model_versions enable row level security;
revoke all on public.death_model_versions from anon, authenticated;
grant select on public.death_model_versions to authenticated;
grant all on public.death_model_versions to service_role;
create policy "Read registered classifiers" on public.death_model_versions for select to authenticated using (true);

create table public.report_death_assessments (
  report_id uuid not null references public.reports(id) on delete cascade,
  detector_updated_at timestamptz not null,
  model_sha256 text not null references public.death_model_versions(sha256),
  status text not null check (status in ('complete', 'unavailable', 'failed')),
  scores jsonb not null check (jsonb_typeof(scores) = 'array'),
  error_code text check (error_code in ('native_build_required', 'inference_failed')),
  threshold double precision not null,
  proposed_dead boolean not null,
  route text not null default 'community_verification' check (route = 'community_verification'),
  source text not null default 'untrusted_device_shadow' check (source = 'untrusted_device_shadow'),
  updated_at timestamptz not null default now(),
  primary key (report_id, detector_updated_at, model_sha256)
);
alter table public.report_death_assessments enable row level security;
revoke all on public.report_death_assessments from anon, authenticated;
grant select on public.report_death_assessments to authenticated;
grant all on public.report_death_assessments to service_role;
-- Hide scores from other reviewers to avoid influencing biological labels.
create policy "Read own shadow assessments" on public.report_death_assessments for select to authenticated
 using (exists (select 1 from public.reports r where r.id = report_id and r.user_id = (select auth.uid())));

create function public.save_death_assessment(p_report_id uuid, p_detector_updated_at timestamptz,
 p_model_sha256 text, p_status text, p_scores jsonb, p_error_code text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare gate public.report_identifications; model public.death_model_versions; value jsonb; score double precision;
 all_dead boolean := true;
begin
 if not exists (select 1 from public.reports where id = p_report_id and user_id = auth.uid()) then
   raise exception 'Report not found';
 end if;
 -- Lock the gate while accepting a snapshot; stale device results cannot replace a new gate.
 select * into gate from public.report_identifications where report_id = p_report_id for share;
 if not found or gate.status <> 'detected' or gate.updated_at <> p_detector_updated_at
    or jsonb_array_length(gate.detections) = 0 then raise exception 'Detection gate not satisfied'; end if;
 select * into model from public.death_model_versions where sha256 = p_model_sha256;
 if not found then raise exception 'Unregistered model'; end if;
 if p_status is null or p_status not in ('complete', 'unavailable', 'failed')
    or p_scores is null or jsonb_typeof(p_scores) <> 'array'
    or (p_status <> 'complete' and jsonb_array_length(p_scores) <> 0)
    or (p_status = 'complete' and jsonb_array_length(p_scores) <> jsonb_array_length(gate.detections))
    or (p_status = 'complete' and p_error_code is not null)
    or (p_status <> 'complete' and (p_error_code is null or p_error_code not in ('native_build_required', 'inference_failed')))
 then raise exception 'Invalid assessment'; end if;
 for value in select * from jsonb_array_elements(p_scores) loop
   if jsonb_typeof(value) <> 'number' then raise exception 'Invalid score'; end if;
   score := value::text::double precision;
   if not (score between 0 and 1) then raise exception 'Invalid score'; end if;
   all_dead := all_dead and score >= model.threshold;
 end loop;
 insert into public.report_death_assessments
  (report_id, detector_updated_at, model_sha256, status, scores, error_code, threshold, proposed_dead)
 values (p_report_id, p_detector_updated_at, p_model_sha256, p_status, p_scores, p_error_code,
         model.threshold, p_status = 'complete' and all_dead)
 on conflict (report_id, detector_updated_at, model_sha256) do update
 set status = excluded.status, scores = excluded.scores, error_code = excluded.error_code,
     proposed_dead = excluded.proposed_dead, updated_at = now()
 -- Completed observations remain stable. Failed or web-only attempts can resume on a phone.
 where public.report_death_assessments.status <> 'complete';
end; $$;
revoke all on function public.save_death_assessment(uuid,timestamptz,text,text,jsonb,text) from public, anon;
grant execute on function public.save_death_assessment(uuid,timestamptz,text,text,jsonb,text) to authenticated;

create table public.report_verification_votes (
 report_id uuid not null references public.reports(id) on delete cascade,
 detector_updated_at timestamptz not null,
 detection_index integer not null check (detection_index >= 0),
 voter_id uuid not null references auth.users(id) on delete cascade,
 label text not null check (label in ('alive','dead','uncertain')),
 updated_at timestamptz not null default now(),
 primary key (report_id, detector_updated_at, detection_index, voter_id)
);
alter table public.report_verification_votes enable row level security;
revoke all on public.report_verification_votes from anon, authenticated;
grant select on public.report_verification_votes to authenticated;
grant all on public.report_verification_votes to service_role;
create policy "Read own biological votes" on public.report_verification_votes for select to authenticated
 using (voter_id = (select auth.uid()) and exists (select 1 from public.reports r
  where r.id = report_id and r.visibility = 'public'));

create function public.set_verification_vote(p_report_id uuid, p_detector_updated_at timestamptz,
 p_detection_index integer, p_label text)
returns void language plpgsql security definer set search_path = '' as $$
declare gate public.report_identifications;
begin
 if auth.uid() is null or not exists (select 1 from public.reports where id = p_report_id
    and visibility = 'public' and user_id <> auth.uid()) then raise exception 'Voting unavailable'; end if;
 select * into gate from public.report_identifications where report_id = p_report_id for share;
 if not found or gate.status <> 'detected' or gate.updated_at <> p_detector_updated_at
    or p_detection_index is null or p_detection_index < 0
    or p_detection_index >= jsonb_array_length(gate.detections) then raise exception 'Invalid detection'; end if;
 if p_label is null then
   delete from public.report_verification_votes where report_id = p_report_id
    and detector_updated_at = p_detector_updated_at and detection_index = p_detection_index and voter_id = auth.uid();
 elsif p_label in ('alive','dead','uncertain') then
   insert into public.report_verification_votes (report_id, detector_updated_at, detection_index, voter_id, label)
    values (p_report_id, p_detector_updated_at, p_detection_index, auth.uid(), p_label)
   on conflict (report_id, detector_updated_at, detection_index, voter_id) do update
    set label = excluded.label, updated_at = now();
 else raise exception 'Invalid label'; end if;
end; $$;
revoke all on function public.set_verification_vote(uuid,timestamptz,integer,text) from public, anon;
grant execute on function public.set_verification_vote(uuid,timestamptz,integer,text) to authenticated;

-- Only return the viewer's label: hide other votes until a separately reviewed
-- dataset is prepared, avoiding herd effects and disclosure of voter identities.
-- Admin exports can aggregate all labels; no vote count automatically verifies a report.

create view public.report_verification_queue with (security_invoker = true) as
 select r.* from public.reports r join public.report_identifications i on i.report_id = r.id
 where r.visibility = 'public' and r.user_id <> auth.uid() and i.status = 'detected'
 and exists (select 1 from jsonb_array_elements(i.detections) with ordinality as box(value, n)
   where not exists (select 1 from public.report_verification_votes v
    where v.report_id = r.id and v.detector_updated_at = i.updated_at
      and v.detection_index = box.n - 1 and v.voter_id = auth.uid()));
revoke all on public.report_verification_queue from public, anon, authenticated;
grant select on public.report_verification_queue to authenticated;

-- Candidate discovery is admin-only; votes are suggestions, not training labels.
grant select on public.reports to service_role;
create view public.death_training_candidates with (security_invoker = true) as
 select r.id as report_id, r.photo_path, i.updated_at as detector_updated_at,
   i.model_id as detector_model_id, box.n - 1 as detection_index, box.value as detection,
   count(*) filter (where v.label = 'alive') as alive_votes,
   count(*) filter (where v.label = 'dead') as dead_votes,
   count(*) filter (where v.label = 'uncertain') as uncertain_votes
 from public.reports r join public.report_identifications i on i.report_id = r.id
 cross join lateral jsonb_array_elements(i.detections) with ordinality as box(value,n)
 join public.report_verification_votes v on v.report_id = r.id and v.detector_updated_at = i.updated_at
   and v.detection_index = box.n - 1
 where r.visibility = 'public' and i.status = 'detected'
 group by r.id, r.photo_path, i.updated_at, i.model_id, box.n, box.value;
revoke all on public.death_training_candidates from public, anon, authenticated;
grant select on public.death_training_candidates to service_role;

create table public.death_training_reviews (
 report_id uuid not null references public.reports(id) on delete cascade,
 detector_updated_at timestamptz not null,
 detection_index integer not null check (detection_index >= 0),
 label text not null check (label in ('alive','dead','excluded')),
 specimen_group text not null check (char_length(btrim(specimen_group)) > 0),
 dataset_split text not null check (dataset_split in ('train','calibration','test')),
 reviewed_by text not null check (char_length(btrim(reviewed_by)) > 0),
 reviewed_at timestamptz not null default now(),
 primary key (report_id, detector_updated_at, detection_index)
);
alter table public.death_training_reviews enable row level security;
revoke all on public.death_training_reviews from public, anon, authenticated;
grant all on public.death_training_reviews to service_role;

create function private.check_death_training_review() returns trigger
 language plpgsql security definer set search_path = '' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.specimen_group, 0));
 if exists (select 1 from public.death_training_reviews t where t.specimen_group = new.specimen_group
   and t.dataset_split <> new.dataset_split
   and (t.report_id, t.detector_updated_at, t.detection_index)
     <> (new.report_id, new.detector_updated_at, new.detection_index)) then
   raise exception 'A specimen group must stay in one dataset split';
 end if;
 if not exists (select 1 from public.report_identifications i where i.report_id = new.report_id
   and i.status = 'detected' and i.updated_at = new.detector_updated_at
   and new.detection_index < jsonb_array_length(i.detections)) then
   raise exception 'Training review requires a current detected insect';
 end if;
 return new;
end; $$;
revoke all on function private.check_death_training_review() from public, anon, authenticated;
create trigger check_death_training_review before insert or update on public.death_training_reviews
 for each row execute function private.check_death_training_review();

create view public.death_reviewed_training_examples with (security_invoker = true) as
 select t.report_id, r.photo_path, t.detector_updated_at, t.detection_index,
   i.detections -> t.detection_index as detection, i.image_width, i.image_height,
   t.label, t.specimen_group, t.dataset_split, t.reviewed_by, t.reviewed_at
 from public.death_training_reviews t join public.reports r on r.id = t.report_id
 join public.report_identifications i on i.report_id = t.report_id and i.updated_at = t.detector_updated_at
 where r.visibility = 'public' and i.status = 'detected' and t.label <> 'excluded';
revoke all on public.death_reviewed_training_examples from public, anon, authenticated;
grant select on public.death_reviewed_training_examples to service_role;
