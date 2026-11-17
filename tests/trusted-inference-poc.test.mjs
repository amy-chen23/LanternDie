import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { fixture,input,owner,other } from '../proofs/trusted-inference/test-fixture.mjs';
import { createHandler,parseBody,proofConfiguration } from '../proofs/trusted-inference/handler.mjs';
import { createSupabaseStore } from '../proofs/trusted-inference/store.mjs';
import { boundedBytes,ProofError } from '../proofs/trusted-inference/errors.mjs';
const signal=()=>new AbortController().signal;
const rejected=(promise,code)=>assert.rejects(promise,error=>error.code===code);
const call=f=>f.infer(input,'user-token',f.store,signal());
const env={TRUSTED_INFERENCE_POC_ENABLED:'true',TRUSTED_INFERENCE_ALLOWED_USER_IDS:owner,SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server-secret'};
function request(body=input,headers={}) {return Object.assign(new EventEmitter(),{method:'POST',body,headers:{'content-type':'application/json',authorization:'Bearer user-token',...headers}});}
async function invoke(handler,req=request()) {
 let raw;const headers={};const res={statusCode:0,setHeader:(key,value)=>headers[key]=value,end:value=>raw=value};
 await handler(req,res);return {status:res.statusCode,body:JSON.parse(raw),headers};
}
test('proof is disabled by default, production forbidden and nonempty allowlist required',()=>{
 assert.throws(()=>proofConfiguration({}),{code:'not_found'});
 assert.throws(()=>proofConfiguration({...env,VERCEL_ENV:'production'}),{code:'not_found'});
 assert.throws(()=>proofConfiguration({...env,VERCEL:'1'}),{code:'not_found'});
 assert.throws(()=>proofConfiguration({...env,TRUSTED_INFERENCE_ALLOWED_USER_IDS:''}),{code:'proof_not_configured'});
 assert.ok(proofConfiguration({...env,VERCEL:'1',VERCEL_ENV:'preview'}).allowedUserIds.has(owner));
});
test('strict IDs/revision body rejects injected scores, URLs, flags, paths and oversized input',async()=>{
 assert.deepEqual(await parseBody(request()),input);
 for(const extra of [{score:1},{imageUrl:'http://evil'},{shadowOnly:false},{photoPath:'private'},{provenance:'server_trusted'}]) await rejected(parseBody(request({...input,...extra})),'invalid_request');
 for(const body of [{...input,revision:0},{...input,revision:1.5},{...input,insectId:'x'},null,[],'{'])await rejected(parseBody(request(body)),'invalid_request');
 await rejected(parseBody(request(input,{'content-length':'1025'})),'request_too_large');
 await rejected(parseBody(request(' '.repeat(1025))),'request_too_large');
 await rejected(parseBody(request(input,{'content-type':'image/jpeg'})),'json_required');
 await rejected(parseBody(request(input,{'content-encoding':'gzip'})),'content_encoding_not_supported');
});
test('HTTP contract supports Vercel parsed body, rejects unauthenticated/method requests and sanitizes errors',async()=>{
 let calls=0;const handler=createHandler({getConfig:()=>proofConfiguration(env),createStore:()=>({}),infer:async()=>{calls++;throw new Error('server-secret private SQL image path');}});
 assert.equal((await invoke(handler,request(input,{authorization:''}))).status,401);
 const get=request();get.method='GET';assert.equal((await invoke(handler,get)).status,405);assert.equal(calls,0);
 const result=await invoke(handler);assert.equal(result.status,503);assert.deepEqual(result.body,{error:'inference_failed',shadowOnly:true});assert.equal(result.headers['Cache-Control'],'no-store');
});
test('owner inference persists server provenance with no label, then authorized replay avoids scoring',async()=>{
 const f=fixture();const first=await call(f),second=await call(f);
 assert.deepEqual(first,second);assert.equal(first.shadowOnly,true);assert.equal(first.predictedLifeStatus,null);
 assert.equal(first.provenance,'server_trusted');assert.equal(f.state.scores,1);assert.equal(f.state.saves,1);assert.equal(f.state.auths,2);
 assert.match([...f.state.predictions.keys()][0],/^shadow-poc-v1:[a-f0-9]{64}$/);
});
test('cross-user access denied before source download; DB-authorized admin may infer',async()=>{
 const f=fixture();f.state.user=other;await rejected(call(f),'report_not_found');assert.equal(f.state.downloads,0);assert.equal(f.state.scores,0);
 f.state.admin=true;assert.equal((await call(f)).shadowOnly,true);
});
test('unauthorized users and invalid tokens never initialize model',async()=>{
 const f=fixture();f.state.user='cccccccc-cccc-cccc-cccc-cccccccccccc';await rejected(call(f),'user_not_allowlisted');
 f.store.authenticate=async()=>{throw new ProofError(401,'invalid_access_token');};await rejected(call(f),'invalid_access_token');assert.equal(f.state.scores,0);
});
test('stale, inactive, mismatched, undetected and rejected sources fail closed',async()=>{
 const cases=[['stale_insect_revision',f=>f.state.insect.revision++],['stale_insect_revision',f=>f.state.insect.active=false],
 ['report_not_found',f=>f.state.insect.report_id=other],['accepted_detection_required',f=>f.state.detection.status='pending'],
 ['accepted_detection_required',f=>f.state.report.workflow_status='rejected'],['accepted_detection_required',f=>f.state.insect.box.x=1],
 ['invalid_source_geometry',f=>{f.state.detection.image_width=1;}],['image_dimensions_changed',f=>f.state.report.photo_height=204],
 ['invalid_detection_snapshot',f=>f.state.detection.updated_at='invalid']];
 for(const [code,mutate] of cases){const f=fixture();mutate(f);await rejected(call(f),code);assert.equal(f.state.downloads,0,code);}
});
test('private path traversal and image substitution cannot reach inference',async()=>{
 for(const path of [`${other}/x.jpg`,`${owner}/../x.jpg`,`${owner}/x?token=x`,`${owner}//x.jpg`,`https://evil/x.jpg`]){
  const f=fixture();f.state.report.photo_path=path;await rejected(call(f),'invalid_source_path');assert.equal(f.state.downloads,0);
 }
 const f=fixture();f.state.photo=Buffer.from('substitution');await rejected(call(f),'source_image_checksum_mismatch');assert.equal(f.state.scores,0);
});
test('foundation and model identity must match; no acceptance threshold is selected',async()=>{
 for(const [code,mutate] of [['shadow_foundation_required',f=>f.state.settings=null],['shadow_foundation_required',f=>f.state.settings.live_enabled=true],
 ['registered_model_mismatch',f=>f.state.model.preprocessing_version='other'],['registered_photo_hash_required',f=>f.state.photoHash=null]]){
  const f=fixture();mutate(f);await rejected(call(f),code);assert.equal(f.state.scores,0);
 }
});
test('storage failure, invalid score and inference exception do not persist; retry recovers',async()=>{
 const f=fixture();const download=f.store.downloadPhoto;f.store.downloadPhoto=async()=>{throw new ProofError(503,'photo_unavailable');};await rejected(call(f),'photo_unavailable');
 f.store.downloadPhoto=download;await call(f);assert.equal(f.state.saves,1);
 for(const value of [NaN,Infinity,-0.01,1.01]){const bad=fixture({classifier:{score:async()=>value}});await rejected(call(bad),'invalid_model_output');assert.equal(bad.state.saves,0);}
 const bad=fixture({classifier:{score:async()=>{throw Error('native failure');}}});await assert.rejects(call(bad));assert.equal(bad.state.saves,0);
});
test('box or detector changes during inference abort persistence',async()=>{
 for(const change of [f=>f.state.insect.revision++,f=>f.state.detection.updated_at='2026-11-13T13:00:00Z',f=>f.state.report.workflow_status='rejected']){
  const f=fixture();const score=f.infer;let once=true;const original=f.store.getReport;
  f.store.getReport=async()=>{if(!once)change(f);once=false;return original();};
  await assert.rejects(call(f));assert.equal(f.state.saves,0);
 }
});
test('concurrent identical requests coalesce; independent instances reconcile one immutable winner',async()=>{
 const f=fixture();const results=await Promise.all(Array.from({length:8},()=>call(f)));
 assert.equal(new Set(results.map(x=>x.predictionId)).size,1);assert.equal(f.state.scores,1);
 const g=fixture();const a=g.makeService(),b=g.makeService();const pair=await Promise.all([a(input,'token',g.store,signal()),b(input,'token',g.store,signal())]);
 assert.deepEqual(pair[0],pair[1]);assert.equal(g.state.predictions.size,1);assert.equal(g.state.saves,2);
});
test('cached records are reauthorized and corrupted provenance rejected',async()=>{
 const f=fixture();await call(f);f.state.user=other;await rejected(call(f),'report_not_found');
 f.state.user=owner;[...f.state.predictions.values()][0].provenance='browser_untrusted';await rejected(call(f),'prediction_identity_conflict');
});
test('failure to persist and revision race after RPC are explicit errors',async()=>{
 const f=fixture();f.store.savePrediction=async()=>null;await rejected(call(f),'prediction_not_persisted');
 f.store.savePrediction=async()=>{f.state.insect.revision++;return null;};await rejected(call(f),'stale_insect_revision');
});
test('aborted requests cannot persist',async()=>{
 const f=fixture();const controller=new AbortController();f.store.downloadPhoto=async()=>{controller.abort();return f.state.photo;};
 await rejected(f.infer(input,'token',f.store,controller.signal),'request_timeout');assert.equal(f.state.saves,0);
});
test('fixed Supabase API boundaries verify user with Auth and admin using user JWT',async()=>{
 const calls=[];const store=createSupabaseStore({supabaseUrl:'https://test.supabase.co',anonKey:'anon',serviceKey:'secret'},async(url,options)=>{
  calls.push({url:String(url),...options});return new Response(url.pathname==='/auth/v1/user'?JSON.stringify({id:owner}):url.pathname.endsWith('get_my_admin_status')?'true':url.pathname.startsWith('/storage/')?new Uint8Array([255,216]):'[]',{headers:{'content-type':url.pathname.startsWith('/storage/')?'image/jpeg':'application/json'}});
 });
 await store.authenticate('jwt');await store.isAdmin('jwt');await store.getReport(input.reportId);await store.downloadPhoto(`${owner}/x.jpg`);
 assert.equal(calls[0].headers.Authorization,'Bearer jwt');assert.equal(calls[0].headers.apikey,'anon');assert.equal(calls[1].headers.Authorization,'Bearer jwt');
 assert.equal(calls[2].headers.Authorization,'Bearer secret');assert.equal(calls[3].headers.Authorization,'Bearer secret');
 assert.ok(calls.every(c=>c.redirect==='error'&&new URL(c.url).origin==='https://test.supabase.co'));
 assert.match(calls[3].url,/\/storage\/v1\/object\/authenticated\/report-photos\//);
});
test('Auth denial, upstream errors, MIME mismatch and oversized storage responses are safe',async()=>{
 const config={supabaseUrl:'https://test.supabase.co',anonKey:'anon',serviceKey:'secret'};
 assert.throws(()=>createSupabaseStore({...config,supabaseUrl:'http://localhost'}),{code:'proof_not_configured'});
 await rejected(createSupabaseStore(config,async()=>new Response('secret',{status:401})).authenticate('bad'),'invalid_access_token');
 await rejected(createSupabaseStore(config,async()=>{throw Error('secret');}).getReport(input.reportId),'upstream_unavailable');
 await rejected(createSupabaseStore(config,async()=>new Response('png',{headers:{'content-type':'image/png'}})).downloadPhoto('x'),'invalid_stored_image');
 await rejected(boundedBytes(new Response('x',{headers:{'content-length':'5242881'}}),5*1024*1024),'upstream_response_too_large');
 await rejected(boundedBytes(new Response(new Uint8Array(11)),10),'upstream_response_too_large');
 assert.equal(await createSupabaseStore(config,async()=>new Response('private SQL secret',{status:400})).savePrediction({}),null);
});
test('per-instance pending capacity is bounded and failed jobs release slots',async()=>{
 let finish,started;const waiting=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>finish=resolve);
 const f=fixture({classifier:{score:async()=>{started();await gate;return 0.1;}}});
 const original=f.store.getInsect;f.store.getInsect=async id=>({...await original(),id});
 const first=call(f);await waiting;
 const second=f.infer({...input,insectId:'22222222-2222-2222-2222-222222222222'},'token',f.store,signal());
 // Allow authorization/source reads to reach the queue before the third request.
 await new Promise(resolve=>setImmediate(resolve));
 await rejected(f.infer({...input,insectId:'33333333-3333-3333-3333-333333333333'},'token',f.store,signal()),'inference_capacity_reached');
 finish();await first;await assert.rejects(second); // Fixture deliberately records only the first insect identity.
});
test('raw Node request stream and soft deadline are handled without persistence',async()=>{
 const raw={headers:{'content-type':'application/json'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(input));}};
 assert.deepEqual(await parseBody(raw),input);
 const handler=createHandler({getConfig:()=>proofConfiguration(env),createStore:()=>({}),timeoutMs:1,infer:async()=>{await new Promise(resolve=>setTimeout(resolve,10));return {shadowOnly:true};}});
 const response=await invoke(handler);assert.equal(response.status,503);assert.equal(response.body.error,'request_timeout');
});
