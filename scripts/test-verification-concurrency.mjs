// Creates its OWN disposable PostgreSQL cluster; never touches an existing DB.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
const root=await mkdtemp(path.join(tmpdir(),'lanterndie-verification-race-'));
const data=path.join(root,'pg');let started=false;
const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const psql=['-qAt','-h','127.0.0.1','-p',String(port),'-U','verification_test','-d','postgres','-v','ON_ERROR_STOP=1'];
try{
 execFileSync('initdb',['-D',data,'-U','verification_test','--auth=trust'],{stdio:'pipe'});
 execFileSync('pg_ctl',['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-p ${port} -h 127.0.0.1 -k ${root}`,'-w','start'],{stdio:'pipe'});started=true;
 const source=path.resolve('tests/verification-foundations-access.sql');
 let setup=(await readFile(source,'utf8')).replace(/^\\ir (.+)$/gm,(_,file)=>`\\ir ${path.resolve(path.dirname(source),file)}`)
  .replace(/^rollback;$/m,'commit;');
 setup+=`\ninsert into public.reports(id,user_id,photo_path) values('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/race.jpg');
 select public.register_report_photo_hash('44444444-4444-4444-4444-444444444444',repeat('d',64));
 insert into public.report_insects(id,report_id,box) values('d1111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444','{"x":0,"y":0,"width":10,"height":10}');
 do $$declare pred uuid;p uuid;begin
 select id into p from public.verification_policies where version='fixture-only-not-production';
 pred:=public.record_trusted_model_prediction('d1111111-1111-1111-1111-111111111111',1,'57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d',0.9999,'DEAD','node','test',now(),repeat('d',64),'race-pred');
 perform public.transition_shadow_verification('d1111111-1111-1111-1111-111111111111',1,0,'AI_CLASSIFIED',null,'model',p,pred,'TEST race','race-classify');
 perform public.transition_shadow_verification('d1111111-1111-1111-1111-111111111111',1,1,'PROVISIONAL','DEAD','model',p,pred,'TEST race','race-accept');end$$;`;
 const fixture=path.join(root,'setup.sql');await writeFile(fixture,setup);
 execFileSync('psql',[...psql,'-f',fixture],{stdio:'pipe'});
 const grant=`begin;set local role service_role;select public.record_shadow_credit_event('d1111111-1111-1111-1111-111111111111',(select id from public.verification_decisions where idempotency_key='race-accept'),'PROVISIONAL','same-race-event','TEST race');select pg_sleep(0.2);commit;`;
 const replies=await Promise.all(Array.from({length:4},()=>exec('psql',[...psql,'-c',grant])));
 const ids=replies.map(r=>r.stdout.trim());assert.equal(new Set(ids).size,1,'Same event returned different IDs');
 const count=execFileSync('psql',[...psql,'-c',"select count(*) from public.insect_credit_events e join public.insect_credit_accounts a on a.id=e.account_id where a.insect_id='d1111111-1111-1111-1111-111111111111'"],{encoding:'utf8'}).trim();
 assert.equal(count,'1','Concurrent duplicate credit events');
 const contest=key=>`begin;set local role service_role;select public.transition_shadow_verification('d1111111-1111-1111-1111-111111111111',1,2,'CONTESTED','DEAD','admin',(select id from public.verification_policies where version='fixture-only-not-production'),(select id from public.insect_model_predictions where idempotency_key='server:race-pred'),'TEST race','${key}');select pg_sleep(0.2);commit;`;
 const races=await Promise.allSettled(['decision-race-a','decision-race-b'].map(key=>exec('psql',[...psql,'-c',contest(key)])));
 assert.equal(races.filter(r=>r.status==='fulfilled').length,1,'Both stale workers committed authoritative decisions');
 const rejected=races.find(r=>r.status==='rejected');assert.match(rejected.reason.stderr,/Decision version changed/);
 console.log('PASS 4 concurrent credit retries -> 1 event; 2 concurrent decisions -> 1 commit and 1 stale-version rejection.');
}finally{
 if(started)execFileSync('pg_ctl',['-D',data,'-m','fast','stop'],{stdio:'pipe'});
 await rm(root,{recursive:true,force:true});
}
