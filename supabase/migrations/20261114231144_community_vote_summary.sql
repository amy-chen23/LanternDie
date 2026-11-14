-- Aggregate access is separate from review seats and never exposes identities or
-- machine scores. Keep the privileged reader outside the exposed public schema.
create function private.report_vote_summary(p_report_id uuid)
returns table(insect_id uuid,revision integer,final_label text,alive_votes bigint,dead_votes bigint,uncertain_votes bigint)
language plpgsql stable security definer set search_path='' as $$
declare r public.reports; viewer uuid := auth.uid(); approved boolean;
begin
 select * into r from public.reports where id=p_report_id;
 -- Match "Read report workflow" RLS, including owners and admins. A definer
 -- must check this explicitly rather than relying on its bypassed table RLS.
 if viewer is null or r.id is null or r.workflow_status='rejected' or not (
   r.user_id=viewer or r.workflow_status='published' or private.is_report_admin()
   or (r.workflow_status='pending_review' and private.is_active_reviewer())
 ) then raise exception 'Community votes unavailable'; end if;

 approved := r.workflow_status='published' and r.insects_ready
   and exists(select 1 from public.report_insects i where i.report_id=r.id and i.active)
   and not exists(select 1 from public.report_insects i where i.report_id=r.id and i.active and i.label='pending');

 return query
 select i.id,i.revision,nullif(i.label,'pending'),
   case when access.allowed then totals.alive end,
   case when access.allowed then totals.dead end,
   case when access.allowed then totals.uncertain end
 from public.report_insects i
 cross join lateral (select approved or exists(
   select 1 from public.insect_review_votes v where v.insect_id=i.id
     and v.revision=i.revision and v.reviewer_id=viewer
 ) as allowed) access
 left join lateral (
   select count(*) filter(where v.label='alive') as alive,
     count(*) filter(where v.label='dead') as dead,
     count(*) filter(where v.label='uncertain') as uncertain
   from public.insect_review_votes v
   where access.allowed and v.insect_id=i.id and v.revision=i.revision
 ) totals on true
 where i.report_id=r.id and i.active order by i.id;
end; $$;
revoke all on function private.report_vote_summary(uuid) from public,anon,authenticated,service_role;
grant execute on function private.report_vote_summary(uuid) to authenticated;

create function public.get_report_vote_summary(p_report_id uuid)
returns table(insect_id uuid,revision integer,final_label text,alive_votes bigint,dead_votes bigint,uncertain_votes bigint)
language sql stable security invoker set search_path='' as $$
 select * from private.report_vote_summary(p_report_id);
$$;
revoke all on function public.get_report_vote_summary(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_report_vote_summary(uuid) to authenticated;
