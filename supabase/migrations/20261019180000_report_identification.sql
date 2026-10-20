-- Model output is separate from user-editable report details.
create table public.report_identifications (
  report_id uuid primary key references public.reports (id) on delete cascade,
  status text not null check (status in ('processing', 'detected', 'not_detected', 'failed')),
  model_id text,
  confidence_threshold double precision check (confidence_threshold between 0 and 1),
  image_width integer check (image_width > 0),
  image_height integer check (image_height > 0),
  detections jsonb not null default '[]'::jsonb check (jsonb_typeof(detections) = 'array'),
  error_message text,
  attempt_id uuid not null,
  updated_at timestamptz not null default now()
);

alter table public.report_identifications enable row level security;
revoke all on public.report_identifications from anon, authenticated;
grant select on public.report_identifications to authenticated;
grant all on public.report_identifications to service_role;
create policy "Read identification for visible reports"
  on public.report_identifications for select to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id));

-- A short lease prevents parallel requests from charging for duplicate inference.
-- A crashed request can be retried after two minutes. Completed results are cached.
create function public.claim_report_identification(p_report_id uuid, p_attempt_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed uuid;
begin
  insert into public.report_identifications (report_id, status, attempt_id)
  values (p_report_id, 'processing', p_attempt_id)
  on conflict (report_id) do update
    set status = 'processing', attempt_id = excluded.attempt_id,
        error_message = null, updated_at = now()
    where public.report_identifications.status = 'failed'
       or (public.report_identifications.status = 'processing'
           and public.report_identifications.updated_at < now() - interval '2 minutes')
  returning report_id into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.claim_report_identification(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_report_identification(uuid, uuid) to service_role;
