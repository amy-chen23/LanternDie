-- Feed visibility is independent of verification. Signed-in members may see
-- pending uploads immediately; decisions, credits, and reviewer eligibility stay
-- behind the existing RPCs. Rejected (including exact duplicate) posts stay hidden
-- from other members. Owners and admins retain their existing access.
drop policy "Read report workflow" on public.reports;
create policy "Read report workflow" on public.reports for select to authenticated using (
 user_id = (select auth.uid()) or (select private.is_report_admin())
 or (visibility = 'public' and workflow_status in ('pending_detection','pending_review','admin_review','published'))
);
-- The existing report-photo SELECT policy checks visible report rows, so photos
-- follow this same access rule without making the storage bucket public.
