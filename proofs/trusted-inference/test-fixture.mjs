// Test-only repository. Never imported by entry.mjs or included in the function.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createInferenceService, PREPROCESSING } from './service.mjs';
export const metadata=JSON.parse(await readFile(new URL('../../assets/models/model.json',import.meta.url)));
export const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
export const input={reportId:'11111111-1111-1111-1111-111111111111',insectId:'a1111111-1111-1111-1111-111111111111',revision:1};
export const box={x:0,y:0,width:135,height:203};
export function fixture({classifier,photo=Buffer.from([255,216,1,2])}={}) {
 const state={user:owner,admin:false,photo,report:{id:input.reportId,user_id:owner,photo_path:`${owner}/proof.jpg`,workflow_status:'pending_review',photo_width:135,photo_height:203},
  insect:{id:input.insectId,report_id:input.reportId,revision:1,active:true,box:{...box}},
  detection:{report_id:input.reportId,status:'detected',image_width:135,image_height:203,detections:[{...box}],updated_at:'2026-11-13T12:00:00Z'},
  photoHash:{sha256:createHash('sha256').update(photo).digest('hex')},settings:{live_enabled:false},model:{sha256:metadata.sha256,version:'fixture-model-version',preprocessing_version:PREPROCESSING},
  predictions:new Map(),auths:0,downloads:0,scores:0,saves:0};
 const clone=value=>structuredClone(value);
 const store={authenticate:async()=>{state.auths++;return {id:state.user};},isAdmin:async()=>state.admin,
 getReport:async()=>clone(state.report),getInsect:async()=>clone(state.insect),getDetection:async()=>clone(state.detection),
 getPhotoHash:async()=>clone(state.photoHash),getSettings:async()=>clone(state.settings),getModel:async()=>clone(state.model),
 downloadPhoto:async()=>{state.downloads++;return state.photo;},findPrediction:async key=>state.predictions.get(key)??null,
 savePrediction:async args=>{
  state.saves++;
  if(state.predictions.has(args.p_key))return null;
  const row={id:'99999999-9999-9999-9999-999999999999',report_id:input.reportId,insect_id:input.insectId,box_revision:args.p_revision,
    raw_dead_score:args.p_raw_dead_score,predicted_life_status:args.p_predicted_life_status,model_sha256:args.p_model_sha256,model_version:state.model.version,
    preprocessing_version:PREPROCESSING,provenance:'server_trusted',inference_runtime:args.p_runtime,runtime_version:args.p_runtime_version,
    source_image_sha256:args.p_image_sha256,inference_at:args.p_inference_at};
  state.predictions.set(args.p_key,row);return row.id;
 }};
 const scorer=classifier??{score:async()=>{state.scores++;return 0.999;}};
 const makeService=()=>createInferenceService({metadata,classifier:scorer,allowedUserIds:new Set([owner,other])});
 return {state,store,infer:makeService(),makeService};
}
