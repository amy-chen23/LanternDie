-- Unclassified insects need admin attention immediately, not only after 48h.
-- Community voting remains available; this view does not finalize any decisions.
create or replace view public.report_admin_queue with (security_invoker=true) as
 select r.* from public.reports r where private.is_report_admin() and (
  r.workflow_status in ('admin_review','pending_review')
  or (r.workflow_status='published' and exists(select 1 from public.report_insects i
   where i.report_id=r.id and i.active and i.label='pending'))
 );
revoke all on public.report_admin_queue from public,anon,authenticated,service_role;
grant select on public.report_admin_queue to authenticated,service_role;
