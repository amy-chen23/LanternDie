// Actual packaged handler + native model + real disposable PostgreSQL RPCs.
// Auth and Storage are explicitly STUBBED at fetch(), not hosted services.
import { execFile,execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import jpeg from 'jpeg-js';
const exec=promisify(execFile),root=await mkdtemp(path.join(tmpdir(),'lanterndie-m2a-pg-'));
const data=path.join(root,'pg');let started=false;
const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const args=['-qAt','-h','127.0.0.1','-p',String(port),'-U','verification_test','-d','postgres','-v','ON_ERROR_STOP=1'];
const literal=value=>value===null?'null':`'${String(value).replaceAll("'","''")}'`;
async function sql(query){return (await exec('psql',[...args,'-c',query],{maxBuffer:8*1024*1024})).stdout.trim();}
const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const reportId='44444444-4444-4444-4444-444444444444';
const insectId=n=>`d1111111-1111-1111-1111-${String(n).padStart(12,'0')}`;
const modelSha='57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d';
const images=new Map(),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let downloads=0,auths=0,saves=0;const requests=[];
const originalFetch=globalThis.fetch;
try {
 execFileSync('initdb',['-D',data,'-U','verification_test','--auth=trust'],{stdio:'pipe'});
 execFileSync('pg_ctl',['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-p ${port} -h 127.0.0.1 -k ${root}`,'-w','start'],{stdio:'pipe'});started=true;
 const source=path.resolve('tests/verification-foundations-access.sql');
 const setup=(await readFile(source,'utf8')).replace(/^\\ir (.+)$/gm,(_,file)=>`\\ir ${path.resolve(path.dirname(source),file)}`).replace(/^rollback;$/m,'commit;');
 await writeFile(path.join(root,'setup.sql'),setup);execFileSync('psql',[...args,'-f',path.join(root,'setup.sql')],{stdio:'pipe'});
 const fixtures=JSON.parse(await readFile('tests/fixtures/browser-inference/references.json'));
 const stressData=Buffer.alloc(1600*1600*4);
 for(let i=0;i<stressData.length;i+=4){stressData[i]=(i*17)%256;stressData[i+1]=(i*3)%256;stressData[i+2]=(i*41)%256;stressData[i+3]=255;}
 const stress=jpeg.encode({data:stressData,width:1600,height:1600},75).data;
 fixtures.push({file:'stress.jpg',width:1600,height:1600});
 for(let index=0;index<fixtures.length;index++) {
  const ref=fixtures[index],id=index===0?reportId:index===1?'55555555-5555-5555-5555-555555555555':'66666666-6666-6666-6666-666666666666';
  const bytes=ref.file==='stress.jpg'?stress:await readFile(`tests/fixtures/browser-inference/${ref.file}`);
  const imagePath=`${owner}/${ref.file}`;images.set(imagePath,bytes);
  const box={x:0,y:0,width:ref.width,height:ref.height};
  await sql(`insert into public.reports(id,user_id,photo_path) values(${literal(id)},${literal(owner)},${literal(imagePath)});
   select public.register_report_photo_hash(${literal(id)},${literal(hash(bytes))});
   insert into public.report_identifications(report_id,status,image_width,image_height,detections,attempt_id) values(${literal(id)},'detected',${ref.width},${ref.height},${literal(JSON.stringify([box]))},gen_random_uuid());
   insert into public.report_insects(id,report_id,box) select ('d1111111-1111-1111-1111-'||lpad(n::text,12,'0'))::uuid,${literal(id)},${literal(JSON.stringify(box))} from generate_series(${index*100+1},${index*100+20}) n;
   update public.reports set workflow_status='pending_review',insects_ready=true where id=${literal(id)};`);
 }
 const untouchedTables=['reports','report_insects','insect_review_votes','report_kill_credits','insect_verifications','verification_decisions','insect_credit_accounts','insect_credit_events'];
 const snapshot=async()=>Promise.all(untouchedTables.map(table=>sql(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${table} t`)));
 const before=await snapshot();
 // No real credentials/URLs. All outbound calls must match this fixed stub origin.
 globalThis.fetch=async(url,options)=>{
  url=new URL(url);assert.equal(url.origin,'https://fixture.supabase.co');assert.equal(options.redirect,'error');
  const respond=(value,status=200,headers={})=>new Response(typeof value==='string'?value:JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});
  if(url.pathname==='/auth/v1/user') {
   auths++;const token=options.headers.Authorization;
   if(token==='Bearer owner-token')return respond({id:owner});if(token==='Bearer other-token')return respond({id:other});return respond({},401);
  }
  if(url.pathname==='/rest/v1/rpc/get_my_admin_status')return respond(false);
  assert.equal(options.headers.Authorization,'Bearer fixture-service-secret');
  if(url.pathname.startsWith('/storage/v1/object/authenticated/report-photos/')) {
   downloads++;const imagePath=decodeURIComponent(url.pathname.split('/report-photos/')[1]);const image=images.get(imagePath);
   return image?new Response(image,{headers:{'content-type':'image/jpeg'}}):respond({},404);
  }
  if(url.pathname==='/rest/v1/rpc/record_trusted_model_prediction') {
   saves++;const p=JSON.parse(options.body);requests.push(p);
   try {const id=await sql(`set role service_role;select public.record_trusted_model_prediction(${['p_insect_id','p_revision','p_model_sha256','p_raw_dead_score','p_predicted_life_status','p_runtime','p_runtime_version','p_inference_at','p_image_sha256','p_key'].map(k=>literal(p[k])).join(',')})`);return respond(JSON.stringify(id));}
   catch{return respond('SQL detail deliberately hidden by adapter',400);}
  }
  const table=url.pathname.split('/').at(-1);
  assert.ok(['reports','report_insects','report_identifications','report_photo_hashes','verification_engine_settings','death_model_versions','insect_model_predictions'].includes(table));
  const fields=url.searchParams.get('select');assert.match(fields,/^[a-z0-9_,]+$/);
  const filters=[...url.searchParams].filter(([key])=>!['select','limit'].includes(key));
  const where=filters.map(([key,value])=>{assert.match(key,/^[a-z0-9_]+$/);assert.ok(value.startsWith('eq.'));return `${key}=${literal(value.slice(3))}`;}).join(' and ');
  const result=await sql(`set role service_role;select coalesce(json_agg(t),'[]') from (select ${fields} from public.${table} where ${where} limit 2) t`);
  return respond(result);
 };
 const stub=globalThis.fetch;globalThis.fetch=async(...args)=>{try{return await stub(...args);}catch(error){console.error('Test stub failed:',error.message,error.stderr??'');throw error;}};
 Object.assign(process.env,{TRUSTED_INFERENCE_POC_ENABLED:'true',TRUSTED_INFERENCE_ALLOWED_USER_IDS:`${owner},${other}`,SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-secret'});
 delete process.env.VERCEL;delete process.env.VERCEL_ENV;
 const importStart=performance.now();const packaged=path.resolve(process.argv[2]??'/private/tmp/lanterndie-m2a-local/.vercel/output/functions/api/shadow-inference.func/index.mjs');
 const {default:handler}=await import(pathToFileURL(packaged));const importMs=performance.now()-importStart;
 async function invoke(n,{token='owner-token',id=reportId,revision=1}={}) {
  const req=Object.assign(new EventEmitter(),{method:'POST',body:{reportId:id,insectId:insectId(n),revision},headers:{authorization:`Bearer ${token}`,'content-type':'application/json'}});
  let result;const res={setHeader(){},statusCode:0};
  res.end=function(body){result={status:this.statusCode,body:JSON.parse(body)};};
  const begin=performance.now();await handler(req,res);return {...result,ms:performance.now()-begin};
 }
 assert.equal((await invoke(1,{token:'bad-token'})).status,401);assert.equal(downloads,0);
 assert.equal((await invoke(1,{token:'other-token'})).status,404);assert.equal(downloads,0);
 const cold=await invoke(1);assert.equal(cold.status,200,JSON.stringify(cold));assert.equal(cold.body.shadowOnly,true);assert.equal(cold.body.predictedLifeStatus,null);
 const replay=await invoke(1);assert.deepEqual(replay.body,cold.body);assert.equal(downloads,1);
 const warm=[];for(let n=2;n<=13;n++){const result=await invoke(n);assert.equal(result.status,200,JSON.stringify(result));warm.push(result.ms);}
 const below=await invoke(101,{id:'55555555-5555-5555-5555-555555555555'});assert.equal(below.status,200,JSON.stringify(below));
 const large=await invoke(201,{id:'66666666-6666-6666-6666-666666666666'});assert.equal(large.status,200,JSON.stringify(large));
 const downloadsBefore=downloads;const identical=await Promise.all(Array.from({length:4},()=>invoke(14)));
 assert.ok(identical.every(r=>r.status===200));assert.equal(new Set(identical.map(r=>r.body.predictionId)).size,1);assert.equal(downloads-downloadsBefore,1);
 const {default:otherInstance}=await import(pathToFileURL(packaged).href+'?second-instance');
 // Independent services race through the real append-only RPC with different timestamps.
 const requestFor=async h=>{const req=Object.assign(new EventEmitter(),{method:'POST',body:{reportId,insectId:insectId(15),revision:1},headers:{authorization:'Bearer owner-token','content-type':'application/json'}});let result;await h(req,{setHeader(){},statusCode:0,end(body){result={status:this.statusCode,body:JSON.parse(body)};}});return result;};
 const cross=await Promise.all([requestFor(handler),requestFor(otherInstance)]);assert.ok(cross.every(r=>r.status===200),JSON.stringify(cross));assert.deepEqual(cross[0].body,cross[1].body);
 assert.equal((await invoke(1,{revision:2})).status,409);
 // Null-label shadow evidence cannot satisfy M1 automatic-acceptance validation.
 await assert.rejects(sql(`begin;set local role service_role;
 select public.transition_shadow_verification(${literal(insectId(1))},1,0,'AI_CLASSIFIED',null,'model',
 (select id from public.verification_policies where version='fixture-only-not-production'),${literal(cold.body.predictionId)},'TEST shadow ineligibility','poc-test-classify');
 select public.transition_shadow_verification(${literal(insectId(1))},1,1,'PROVISIONAL','DEAD','model',
 (select id from public.verification_policies where version='fixture-only-not-production'),${literal(cold.body.predictionId)},'TEST shadow ineligibility','poc-test-accept');commit;`),error=>/Trusted matching model evidence required/.test(error.stderr));
 assert.deepEqual(await snapshot(),before,'Inference altered live/shadow decisions, labels or credits');
 assert.equal(await sql(`select count(*) from public.insect_model_predictions where report_id=${literal(reportId)} and insect_id=${literal(insectId(15))}`),'1');
 const numerical=[{file:'above.jpg',score:cold.body.rawDeadScore},{file:'below.jpg',score:below.body.rawDeadScore}];
 const prior=JSON.parse(await readFile('docs/trusted-inference-node22-measurements.json'));
 for(const row of numerical) {row.m1Native=prior.scores.find(s=>s.file===row.file).onnx;row.absoluteDifference=Math.abs(row.score-row.m1Native);assert.ok(row.absoluteDifference<1e-6);}
 warm.sort((a,b)=>a-b);
 const result={kind:'LOCAL macOS packaged Node handler; stubbed Auth/Storage; real PostgreSQL; NOT hosted Vercel',node:process.version,platform:process.platform,arch:process.arch,modelSha256:modelSha,
   packageImportMs:importMs,firstActualInferenceRequestMs:cold.ms,replayMs:replay.ms,warmUncachedRequests:12,warmP50Ms:warm[6],warmP95Ms:warm[11],stress1600SquareRequestMs:large.ms,
   rssBytes:process.memoryUsage().rss,maxRssKiB:process.resourceUsage().maxRSS,numerical,authChecks:auths,downloads,saveAttempts:saves,identicalConcurrency:4,crossInstanceConcurrency:2,
   persistence:'real M1 RPC; single winner; snapshots unchanged for reports/insects/votes/live credits/shadow states/decisions/credit accounts/events',hostedExecutionVerified:false};
 console.log(JSON.stringify(result,null,2));await writeFile('docs/milestone-2a-local-results.json',JSON.stringify(result,null,2)+'\n');
}finally {
 globalThis.fetch=originalFetch;
 if(started)execFileSync('pg_ctl',['-D',data,'-m','fast','stop'],{stdio:'pipe'});
 await rm(root,{recursive:true,force:true});
}
