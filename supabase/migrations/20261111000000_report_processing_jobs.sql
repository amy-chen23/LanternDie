-- A durable outbox: saving a report and enqueuing work are one transaction.
create table public.report_processing_jobs (
 report_id uuid primary key references public.reports(id) on delete cascade,
 status text not null default 'queued' check(status in ('queued','running','retry','complete','duplicate','failed')),
 attempts integer not null default 0 check(attempts >= 0),
 available_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 last_error_code text check(last_error_code in ('duplicate_photo','photo_unavailable','configuration','inference_failed','worker_exhausted')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.report_processing_jobs enable row level security;
revoke all on public.report_processing_jobs from public,anon,authenticated,service_role;
grant select(report_id,status,attempts,available_at,last_error_code,updated_at) on public.report_processing_jobs to authenticated;
grant select on public.report_processing_jobs to service_role;
create policy "Read own processing status" on public.report_processing_jobs for select to authenticated
 using(exists(select 1 from public.reports r where r.id=report_id and r.user_id=auth.uid()) or private.is_report_admin());
create index report_processing_available_idx on public.report_processing_jobs(available_at,created_at)
 where status in ('queued','retry','running');
create function private.enqueue_report_processing() returns trigger
language plpgsql security definer set search_path='' as $$
begin insert into public.report_processing_jobs(report_id) values(new.id); return null; end; $$;
revoke all on function private.enqueue_report_processing() from public,anon,authenticated;
create trigger enqueue_processing after insert on public.reports
 for each row execute function private.enqueue_report_processing();
insert into public.report_processing_jobs(report_id)
 select id from public.reports where workflow_status='pending_detection' on conflict do nothing;

create function public.claim_report_processing_job()
returns table(report_id uuid,photo_path text,lease_token uuid,attempts integer)
language plpgsql security definer set search_path='' as $$
declare job public.report_processing_jobs;
begin
 select j.* into job from public.report_processing_jobs j
 where ((j.status in ('queued','retry') and j.available_at<=now())
  or (j.status='running' and j.lease_until<=now()))
 order by j.available_at,j.created_at,j.report_id for update skip locked limit 1;
 if not found then return; end if;
 update public.report_processing_jobs j set status='running',attempts=j.attempts+1,
  lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
 where j.report_id=job.report_id returning j.* into job;
 return query select job.report_id,r.photo_path,job.lease_token,job.attempts
 from public.reports r where r.id=job.report_id;
end; $$;
revoke all on function public.claim_report_processing_job() from public,anon,authenticated;
grant execute on function public.claim_report_processing_job() to service_role;

-- All finishing operations use the same report->job lock order and fence stale
-- workers. An expired attempt can never write after another worker takes over.
create function private.lock_processing_job(p_report_id uuid,p_lease_token uuid)
returns public.report_processing_jobs language plpgsql security definer set search_path='' as $$
declare job public.report_processing_jobs;
begin
 perform 1 from public.reports where id=p_report_id for update;
 select * into job from public.report_processing_jobs where report_id=p_report_id for update;
 if not found or job.status<>'running' or job.lease_token is distinct from p_lease_token
  or job.lease_until<=now() then raise exception 'Processing lease lost'; end if;
 return job;
end; $$;
revoke all on function private.lock_processing_job(uuid,uuid) from public,anon,authenticated;

create function public.prepare_report_processing(p_report_id uuid,p_lease_token uuid,p_sha256 text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_processing_job(p_report_id,p_lease_token);
 begin
  perform public.register_report_photo_hash(p_report_id,p_sha256);
 exception when unique_violation then
  update public.report_processing_jobs set status='duplicate',last_error_code='duplicate_photo',
   lease_token=null,lease_until=null,updated_at=now() where report_id=p_report_id;
  update public.reports set workflow_status='rejected' where id=p_report_id;
  perform private.reconcile_report(p_report_id);
  return false;
 end;
 return true;
end; $$;
revoke all on function public.prepare_report_processing(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_report_processing(uuid,uuid,text) to service_role;

create function public.complete_report_processing(p_report_id uuid,p_lease_token uuid,
 p_result jsonb,p_model_id text,p_threshold double precision) returns void
language plpgsql security definer set search_path='' as $$
declare stamp timestamptz := clock_timestamp();
begin
 perform private.lock_processing_job(p_report_id,p_lease_token);
 if not exists(select 1 from public.report_photo_hashes where report_id=p_report_id) then
  raise exception 'Register trusted photo hash first'; end if;
 -- Do not replace manual corrections or undo an admin rejection mid-flight.
 if not exists(select 1 from public.report_insects where report_id=p_report_id)
  and exists(select 1 from public.reports where id=p_report_id and workflow_status<>'rejected') then
  if jsonb_typeof(p_result->'detections') is distinct from 'array'
   or (p_result->>'image_width')::integer<=0 or (p_result->>'image_height')::integer<=0
   or p_result->>'image_width' is null or p_result->>'image_height' is null
   or p_model_id is null or p_threshold is null or not(p_threshold>0 and p_threshold<=1) then
   raise exception 'Invalid detection result'; end if;
  insert into public.report_identifications(report_id,status,model_id,confidence_threshold,
   image_width,image_height,detections,attempt_id,updated_at,error_message)
  values(p_report_id,case when jsonb_array_length(p_result->'detections')>0 then 'detected' else 'not_detected' end,
   p_model_id,p_threshold,(p_result->>'image_width')::integer,(p_result->>'image_height')::integer,
   p_result->'detections',p_lease_token,stamp,null)
  on conflict(report_id) do update set status=excluded.status,model_id=excluded.model_id,
   confidence_threshold=excluded.confidence_threshold,image_width=excluded.image_width,image_height=excluded.image_height,
   detections=excluded.detections,attempt_id=excluded.attempt_id,updated_at=excluded.updated_at,error_message=null;
  if jsonb_array_length(p_result->'detections')>0 then
   perform public.initialize_report_insects(p_report_id,stamp);
  end if;
 end if;
 update public.report_processing_jobs set status='complete',lease_token=null,lease_until=null,
  last_error_code=null,updated_at=now() where report_id=p_report_id;
end; $$;
revoke all on function public.complete_report_processing(uuid,uuid,jsonb,text,double precision) from public,anon,authenticated;
grant execute on function public.complete_report_processing(uuid,uuid,jsonb,text,double precision) to service_role;

create function public.fail_report_processing(p_report_id uuid,p_lease_token uuid,p_error_code text)
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
  update public.reports set workflow_status='admin_review',review_started_at=coalesce(review_started_at,now())
   where id=p_report_id and workflow_status='pending_detection';
 end if;
end; $$;
revoke all on function public.fail_report_processing(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fail_report_processing(uuid,uuid,text) to service_role;

create function public.retry_report_processing(p_report_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.reports where id=p_report_id and user_id=auth.uid() for update;
 if not found then raise exception 'Report not found'; end if;
 -- Never re-open duplicate/no-detection/admin-decided reports. Terminal technical
 -- failures may be retried by the owner after a cooldown; ordinary retries are automatic.
 if exists(select 1 from public.report_insects where report_id=p_report_id)
  or exists(select 1 from public.reports where id=p_report_id and workflow_status='rejected') then
  raise exception 'Report is already under review or resolved'; end if;
 update public.report_processing_jobs set status='queued',attempts=0,available_at=now(),last_error_code=null,updated_at=now()
 where report_id=p_report_id and status='failed' and updated_at<=now()-interval '15 minutes';
 if not found then raise exception 'Retry unavailable; automatic processing may still be running, or wait 15 minutes'; end if;
 update public.reports set workflow_status='pending_detection' where id=p_report_id;
end; $$;
revoke all on function public.retry_report_processing(uuid) from public,anon;
grant execute on function public.retry_report_processing(uuid) to authenticated;

-- Preserve the bytes referenced by hashes and detector snapshots. Owners can
-- remove an orphan photo after deleting its report, but cannot swap a live photo.
drop policy "Upload own report photos" on storage.objects;
drop policy "Delete own report photos" on storage.objects;
create policy "Upload unreferenced report photos" on storage.objects for insert to authenticated with check(
 bucket_id='report-photos' and (storage.foldername(name))[1]=auth.uid()::text
 and not exists(select 1 from public.reports r where r.photo_path=name));
create policy "Delete orphan report photos" on storage.objects for delete to authenticated using(
 bucket_id='report-photos' and owner_id=auth.uid()::text and (storage.foldername(name))[1]=auth.uid()::text
 and not exists(select 1 from public.reports r where r.photo_path=name));
