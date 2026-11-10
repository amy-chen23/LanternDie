-- Disposable DB only; full schema and role fixtures roll back.
\ir fixtures/report-schema.sql
\ir ../supabase/migrations/20261111000000_report_processing_jobs.sql
\ir ../supabase/migrations/20261112000000_community_review.sql
\ir ../supabase/migrations/20261113000000_admin_role_access.sql
\ir ../supabase/migrations/20261114000000_admin_moderation.sql
insert into public.app_admins(user_id) values('cccccccc-cccc-cccc-cccc-cccccccccccc');

do $$begin
 assert not has_function_privilege('anon','public.admin_get_report_moderation(uuid)','EXECUTE');
 assert not has_function_privilege('authenticated','public.admin_edit_report_insect(uuid,uuid,jsonb,boolean,text)','EXECUTE'), 'Legacy box edit bypass';
 assert not has_function_privilege('authenticated','public.admin_decide_report_insect(uuid,integer,text,text)','EXECUTE'), 'Legacy decision bypass';
 assert not has_function_privilege('authenticated','public.admin_publish_report(uuid,text)','EXECUTE'), 'Legacy publication bypass';
 assert not has_column_privilege('authenticated','public.reports','photo_width','UPDATE');
end$$;
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$begin
 assert public.must_fail($q$select public.admin_get_report_moderation('11111111-1111-1111-1111-111111111111')$q$), 'Non-admin read audit/scores';
 assert public.must_fail($q$select public.admin_moderate_report('11111111-1111-1111-1111-111111111111','0','reject','fake')$q$), 'Non-admin moderation';
end$$;
set local request.jwt.claim.sub='cccccccc-cccc-cccc-cccc-cccccccccccc';
do $$declare s jsonb; next jsonb; iid uuid; begin
 s:=public.admin_get_report_moderation('11111111-1111-1111-1111-111111111111');
 assert public.must_fail(format('select public.admin_moderate_report(%L,%L,''reject'','' '')',s->>'report_id',s->>'version')), 'Blank reason accepted';
 assert public.must_fail(format('select public.admin_moderate_report(%L,''old'',''reject'',''reason'')',s->>'report_id')), 'Stale snapshot accepted';
 assert public.must_fail(format('select public.admin_moderate_report(%L,%L,''box_save'',''reason'',null,null,''{"x":0,"y":0,"width":20,"height":20}'',0,80)',s->>'report_id',s->>'version')), 'Zero photo dimension accepted';
 next:=public.admin_moderate_report((s->>'report_id')::uuid,s->>'version','box_save','missed detection',null,null,
  '{"x":1,"y":1,"width":20,"height":20}',100,80);
 assert next->>'photo_width'='100' and jsonb_array_length(next->'insects')=1;
 iid:=(next->'insects'->0->>'id')::uuid;
 assert public.must_fail(format('select public.admin_moderate_report(%L,%L,''box_save'',''reason'',%L,1,''{"x":90,"y":0,"width":20,"height":20}'',1000,1000)',s->>'report_id',next->>'version',iid)), 'Stored geometry overridden';
 assert public.must_fail(format('select public.admin_moderate_report(%L,%L,''decide_dead'',''reason'',%L,99)',s->>'report_id',next->>'version',iid)), 'Stale box revision accepted';
 s:=public.admin_moderate_report((next->>'report_id')::uuid,next->>'version','decide_dead','clear evidence',iid,1);
 assert public.must_fail(format('select public.admin_moderate_report(%L,%L,''publish'',''publish'')',s->>'report_id',s->>'version')), 'Hashless report published';
 assert s->>'status'='pending_review';
end$$;
reset role;
select public.register_report_photo_hash('11111111-1111-1111-1111-111111111111',repeat('a',64));
set local role authenticated;
do $$declare s jsonb; iid uuid; saved_version text; begin
 s:=public.admin_get_report_moderation('11111111-1111-1111-1111-111111111111');
 s:=public.admin_moderate_report((s->>'report_id')::uuid,s->>'version','publish','publish reviewed insect');
 assert s->>'status'='published' and s->>'kill_credits'='1';
 iid:=(s->'insects'->0->>'id')::uuid;
 saved_version:=s->>'version';
 s:=public.admin_moderate_report((s->>'report_id')::uuid,saved_version,'decide_alive','admin reversal',iid,1);
 assert s->>'kill_credits'='0' and s->>'status'='published';
 assert public.must_fail(format('select public.admin_moderate_report(%L,%L,''reject'',''stale editor'')',s->>'report_id',saved_version)), 'Concurrent admin change overwritten';
 s:=public.admin_moderate_report((s->>'report_id')::uuid,s->>'version','decide_dead','corrected decision',iid,1);
 s:=public.admin_moderate_report((s->>'report_id')::uuid,s->>'version','reject','invalid evidence');
 assert s->>'status'='rejected' and s->>'kill_credits'='0';
 s:=public.admin_moderate_report((s->>'report_id')::uuid,s->>'version','publish','admin restores report');
 assert s->>'status'='published' and s->>'kill_credits'='1';
 s:=public.admin_moderate_report((s->>'report_id')::uuid,s->>'version','box_save','box correction',iid,1,'{"x":2,"y":1,"width":20,"height":20}');
 assert s->>'status'='published' and s->>'kill_credits'='1', 'Correction unpublished or removed committed credit';
 assert s->'insects'->0->>'revision'='2' and s->'insects'->0->>'label'='pending';
 s:=public.admin_moderate_report((s->>'report_id')::uuid,s->>'version','decide_alive','corrected insect alive',iid,2);
 assert s->>'kill_credits'='0';
 s:=public.admin_moderate_report((s->>'report_id')::uuid,s->>'version','box_remove','not a separate insect',iid,2);
 assert s->'insects'->0->>'active'='false' and s->>'status'='published';
 assert public.must_fail(format('select public.admin_moderate_report(%L,%L,''publish'',''empty'')',s->>'report_id',s->>'version')), 'Empty insect set published';
 assert jsonb_array_length(s->'audit')>0;
 assert exists(select 1 from jsonb_array_elements(s->'audit') a where a->'new_data'->>'reason'='not a separate insect'), 'Reason missing from audit';
end$$;
reset role;
insert into public.report_identifications(report_id,status,attempt_id,image_width,image_height) values
 ('22222222-2222-2222-2222-222222222222','not_detected',gen_random_uuid(),120,90);
do $$begin assert (select photo_width=120 and photo_height=90 from public.reports where id='22222222-2222-2222-2222-222222222222'); end$$;
delete from public.app_admins where user_id='cccccccc-cccc-cccc-cccc-cccccccccccc';
set local role authenticated;
do $$begin
 assert public.must_fail($q$select public.admin_get_report_moderation('11111111-1111-1111-1111-111111111111')$q$), 'Revoked admin read snapshot';
 assert public.must_fail($q$select public.admin_moderate_report('11111111-1111-1111-1111-111111111111','0','reject','revoked')$q$), 'Revoked admin wrote';
end$$;
reset role;
rollback;
\echo 'Versioned admin moderation, geometry, permissions, decisions, publication, credit and audit passed.'
