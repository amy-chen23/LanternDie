-- Resume classification without paying for detection again after a transient failure.
alter table public.report_processing_jobs add column detection_checkpoint jsonb,
 add column stage text not null default 'detection' check(stage in ('detection','classification'));
grant select(stage) on public.report_processing_jobs to authenticated;

create function public.claim_report_pipeline_job(p_report_id uuid default null)
returns table(report_id uuid,photo_path text,lease_token uuid,attempts integer,detection_checkpoint jsonb)
language plpgsql security definer set search_path='' as $$
declare job public.report_processing_jobs;
begin
 select j.* into job from public.report_processing_jobs j
 where (p_report_id is null or j.report_id=p_report_id) and
 ((j.status in ('queued','retry') and j.available_at<=now()) or (j.status='running' and j.lease_until<=now()))
 order by j.available_at,j.created_at,j.report_id for update skip locked limit 1;
 if not found then return; end if;
 update public.report_processing_jobs j set status='running',attempts=j.attempts+1,
 lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
 where j.report_id=job.report_id returning j.* into job;
 return query select job.report_id,r.photo_path,job.lease_token,job.attempts,job.detection_checkpoint
 from public.reports r where r.id=job.report_id;
end; $$;
revoke all on function public.claim_report_pipeline_job(uuid) from public,anon,authenticated;
grant execute on function public.claim_report_pipeline_job(uuid) to service_role;

create function public.checkpoint_report_detection(p_report_id uuid,p_lease_token uuid,p_checkpoint jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_processing_job(p_report_id,p_lease_token);
 if jsonb_typeof(p_checkpoint->'result'->'detections') is distinct from 'array'
 or p_checkpoint->>'model' is null or p_checkpoint->>'threshold' is null then raise exception 'Invalid checkpoint'; end if;
 update public.report_processing_jobs set detection_checkpoint=p_checkpoint,stage='classification',updated_at=now()
 where report_id=p_report_id;
end; $$;
revoke all on function public.checkpoint_report_detection(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.checkpoint_report_detection(uuid,uuid,jsonb) to service_role;

-- Server observations are separate from legacy untrusted phone scores. They do
-- not finalize insects: the independent-validation/automatic-approval gate stays off.
create table public.report_model_assessments (
 report_id uuid primary key references public.reports(id) on delete cascade,
 detector_updated_at timestamptz not null,
 model_sha256 text not null references public.death_model_versions(sha256),
 scores jsonb not null check(jsonb_typeof(scores)='array'),
 threshold double precision not null check(threshold between 0 and 1),
 created_at timestamptz not null default now()
);
alter table public.report_model_assessments enable row level security;
revoke all on public.report_model_assessments from public,anon,authenticated,service_role;
grant select on public.report_model_assessments to authenticated,service_role;
create policy "Owner or admin reads pipeline scores" on public.report_model_assessments for select to authenticated
 using(exists(select 1 from public.reports r where r.id=report_id and r.user_id=auth.uid()) or private.is_report_admin());

create function public.complete_report_pipeline(p_report_id uuid,p_lease_token uuid,p_result jsonb,
 p_model_id text,p_threshold double precision,p_assessment jsonb default null)
returns void language plpgsql security definer set search_path='' as $$
declare model public.death_model_versions; score jsonb; stamp timestamptz;
begin
 perform private.lock_processing_job(p_report_id,p_lease_token);
 if jsonb_array_length(p_result->'detections')>0 then
  select * into model from public.death_model_versions where sha256=p_assessment->>'model_sha256';
  if not found or p_assessment->>'preprocessing_version' is distinct from model.preprocessing_version
   or jsonb_typeof(p_assessment->'scores') is distinct from 'array'
   or jsonb_array_length(p_assessment->'scores')<>jsonb_array_length(p_result->'detections') then
   raise exception 'Complete classification required'; end if;
  for score in select * from jsonb_array_elements(p_assessment->'scores') loop
   if jsonb_typeof(score)<>'number' or not (score::text::double precision between 0 and 1) then
    raise exception 'Invalid classifier score'; end if;
  end loop;
 end if;
 -- The existing function preserves manual corrections/admin decisions. Write
 -- scores only when it actually committed this worker's detector snapshot.
 perform public.complete_report_processing(p_report_id,p_lease_token,p_result,p_model_id,p_threshold);
 select updated_at into stamp from public.report_identifications
  where report_id=p_report_id and attempt_id=p_lease_token;
 if stamp is not null and p_assessment is not null and jsonb_array_length(p_result->'detections')>0 then
  insert into public.report_model_assessments(report_id,detector_updated_at,model_sha256,scores,threshold)
  values(p_report_id,stamp,model.sha256,p_assessment->'scores',model.threshold)
  on conflict(report_id) do update set detector_updated_at=excluded.detector_updated_at,
   model_sha256=excluded.model_sha256,scores=excluded.scores,threshold=excluded.threshold,created_at=now();
 end if;
end; $$;
revoke all on function public.complete_report_pipeline(uuid,uuid,jsonb,text,double precision,jsonb) from public,anon,authenticated;
grant execute on function public.complete_report_pipeline(uuid,uuid,jsonb,text,double precision,jsonb) to service_role;

-- pg_net sends after commit, so the worker always sees the durable saved job.
-- Cron remains the recovery path for network failures, backoff and expired leases.
create function private.wake_report_pipeline() returns trigger
language plpgsql security definer set search_path='' as $$
declare endpoint text; token text;
begin
 if new.status<>'queued' or new.available_at>now() then return null; end if;
 if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then return null; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='project_url' limit 1;
 select decrypted_secret into token from vault.decrypted_secrets where name='report_worker_secret' limit 1;
 if endpoint is null or endpoint !~ '^https://[a-z0-9-]+[.]supabase[.]co$' or token is null or length(token)<32 then
  raise warning 'Immediate report wake-up needs worker Vault configuration'; return null;
 end if;
 perform net.http_post(url:=endpoint||'/functions/v1/process-report-jobs',
  headers:=jsonb_build_object('Content-Type','application/json','x-worker-secret',token),
  body:=jsonb_build_object('report_id',new.report_id),timeout_milliseconds:=95000);
 return null;
exception when others then
 -- A failed wake-up must never roll back an upload. Do not log URLs or secrets.
 raise warning 'Immediate report wake-up failed; durable job awaits scheduler'; return null;
end; $$;
revoke all on function private.wake_report_pipeline() from public,anon,authenticated,service_role;
create trigger wake_report_pipeline after insert or update of status on public.report_processing_jobs
 for each row execute function private.wake_report_pipeline();
