-- Image dimensions are immutable photo geometry, not user-editable report data.
alter table public.reports add column photo_width integer,add column photo_height integer,
 add constraint report_photo_dimensions check((photo_width is null and photo_height is null)
  or (photo_width is not null and photo_height is not null and photo_width>0 and photo_height>0));
update public.reports r set photo_width=i.image_width,photo_height=i.image_height
 from public.report_identifications i where i.report_id=r.id and i.image_width>0 and i.image_height>0;
create function private.capture_report_photo_dimensions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.image_width>0 and new.image_height>0 then
  update public.reports set photo_width=new.image_width,photo_height=new.image_height
   where id=new.report_id and photo_width is null;
 end if;
 return null;
end; $$;
revoke all on function private.capture_report_photo_dimensions() from public,anon,authenticated;
create trigger capture_photo_dimensions after insert or update on public.report_identifications
 for each row execute function private.capture_report_photo_dimensions();

create function public.admin_get_report_moderation(p_report_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.is_report_admin() then raise exception 'Admin required'; end if;
 select jsonb_build_object(
  'report_id',r.id,'status',r.workflow_status,'published_at',r.published_at,'insects_ready',r.insects_ready,
  'photo_width',r.photo_width,'photo_height',r.photo_height,
  'photo_registered',exists(select 1 from public.report_photo_hashes h where h.report_id=r.id),
  'kill_credits',coalesce((select dead_insects from public.report_kill_credits c where c.report_id=r.id),0),
  'version',coalesce((select max(a.id)::text from public.report_audit_log a where a.report_id=r.id),'0'),
  'insects',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'revision',i.revision,'box',i.box,
    'active',i.active,'label',i.label,'source',i.decision_source,'reason',i.reason,'model_score',i.model_score,
    'alive_votes',(select count(*) from public.insect_review_votes v where v.insect_id=i.id and v.revision=i.revision and v.label='alive'),
    'dead_votes',(select count(*) from public.insect_review_votes v where v.insect_id=i.id and v.revision=i.revision and v.label='dead'),
    'uncertain_votes',(select count(*) from public.insect_review_votes v where v.insect_id=i.id and v.revision=i.revision and v.label='uncertain')) order by i.id)
    from public.report_insects i where i.report_id=r.id),'[]'::jsonb),
  'audit',coalesce((select jsonb_agg(to_jsonb(history) order by history.id desc) from (
    select a.id,a.actor_id,a.action,a.old_data,a.new_data,a.created_at
     from public.report_audit_log a where a.report_id=r.id order by a.id desc limit 50
   ) history),'[]'::jsonb)
 ) into result from public.reports r where r.id=p_report_id;
 if result is null then raise exception 'Report not found'; end if;
 return result;
end; $$;
revoke all on function public.admin_get_report_moderation(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_get_report_moderation(uuid) to authenticated;

-- A reviewable proposal carries the snapshot version. Concurrent votes, box
-- edits, decisions, and credit changes force a refresh before an admin writes.
create function public.admin_moderate_report(p_report_id uuid,p_version text,p_action text,p_reason text,
 p_insect_id uuid default null,p_revision integer default null,p_box jsonb default null,
 p_image_width integer default null,p_image_height integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.reports; insect public.report_insects; current_version text; key text; n double precision;
begin
 if not private.is_report_admin() then raise exception 'Admin required'; end if;
 if p_reason is null or length(btrim(p_reason))=0 or length(p_reason)>1000 then raise exception 'Reason required (up to 1000 characters)'; end if;
 select * into r from public.reports where id=p_report_id for update;
 if not found then raise exception 'Report not found'; end if;
 select coalesce(max(id)::text,'0') into current_version from public.report_audit_log where report_id=p_report_id;
 if p_version is distinct from current_version then raise exception 'Report changed; refresh before confirming'; end if;
 if p_action is null or p_action not in ('box_save','box_remove','decide_alive','decide_dead','reject','publish') then
  raise exception 'Invalid moderation action'; end if;
 if p_action in ('box_remove','decide_alive','decide_dead') or (p_action='box_save' and p_insect_id is not null) then
  select * into insect from public.report_insects where id=p_insect_id and report_id=p_report_id and active;
  if not found or p_revision is distinct from insect.revision then raise exception 'Box changed; refresh before confirming'; end if;
 end if;
 if p_action='box_save' then
  -- A missed/failed detector may have no geometry. An authenticated admin can
  -- supply the dimensions of the displayed saved photo once; later edits use
  -- server-stored geometry and cannot change it through this endpoint.
  if r.photo_width is null then
   if p_image_width is null or p_image_height is null or p_image_width<=0 or p_image_height<=0
    or p_image_width::bigint*p_image_height::bigint>4000000 then raise exception 'Valid photo dimensions required'; end if;
   update public.reports set photo_width=p_image_width,photo_height=p_image_height where id=r.id;
   r.photo_width:=p_image_width; r.photo_height:=p_image_height;
  end if;
  if jsonb_typeof(p_box) is distinct from 'object' then raise exception 'Invalid box'; end if;
  foreach key in array array['x','y','width','height'] loop
   if jsonb_typeof(p_box->key) is distinct from 'number' then raise exception 'Invalid box'; end if;
   n:=(p_box->>key)::double precision;
   if n<0 or (key in ('width','height') and n<=0) then raise exception 'Invalid box'; end if;
  end loop;
  if (p_box->>'x')::double precision+(p_box->>'width')::double precision>r.photo_width
   or (p_box->>'y')::double precision+(p_box->>'height')::double precision>r.photo_height then
   raise exception 'Box must stay inside the saved photo'; end if;
  perform public.admin_edit_report_insect(r.id,p_insect_id,p_box,true,btrim(p_reason));
 elsif p_action='box_remove' then
  perform public.admin_edit_report_insect(r.id,insect.id,insect.box,false,btrim(p_reason));
 elsif p_action in ('decide_alive','decide_dead') then
  perform public.admin_decide_report_insect(insect.id,insect.revision,
   case when p_action='decide_dead' then 'dead' else 'alive' end,btrim(p_reason));
 elsif p_action='reject' then perform public.admin_reject_report(r.id,btrim(p_reason));
 elsif p_action='publish' then perform public.admin_publish_report(r.id,btrim(p_reason));
 end if;
 return public.admin_get_report_moderation(r.id);
end; $$;
revoke all on function public.admin_moderate_report(uuid,text,text,text,uuid,integer,jsonb,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_moderate_report(uuid,text,text,text,uuid,integer,jsonb,integer,integer) to authenticated;

-- The versioned facade is the only client mutation entry point. Existing private
-- implementation helpers remain callable by its definer, not directly by clients.
revoke execute on function public.admin_edit_report_insect(uuid,uuid,jsonb,boolean,text) from authenticated,service_role;
revoke execute on function public.admin_decide_report_insect(uuid,integer,text,text) from authenticated,service_role;
revoke execute on function public.admin_reject_report(uuid,text) from authenticated,service_role;
revoke execute on function public.admin_publish_report(uuid,text) from authenticated,service_role;
