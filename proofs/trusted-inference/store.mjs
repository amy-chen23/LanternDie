import { boundedBytes, fail, ProofError, uuid } from './errors.mjs';
const MAX_JSON=256*1024;
/** Fixed Supabase REST/Auth/Storage endpoints only; no client-controlled URLs. */
export function createSupabaseStore(config, fetcher=fetch) {
  let base;
  try {base=new URL(config.supabaseUrl);}catch{fail(503,'proof_not_configured');}
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/'
    ||!config.anonKey||!config.serviceKey)fail(503,'proof_not_configured');
  function headers(token,service=false) {return {apikey:service?config.serviceKey:config.anonKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};}
  async function request(endpoint,options,signal) {
    try {return await fetcher(new URL(endpoint,base),{...options,signal,redirect:'error'});}
    catch{fail(503,signal?.aborted?'request_timeout':'upstream_unavailable');}
  }
  async function json(response) {
    try {return JSON.parse(new TextDecoder().decode(await boundedBytes(response,MAX_JSON)));}
    catch(error){if(error instanceof ProofError)throw error;fail(502,'invalid_upstream_response');}
  }
  async function rows(table,query,signal) {
    const url=`/rest/v1/${table}?${new URLSearchParams({...query,limit:'2'})}`;
    const response=await request(url,{headers:headers(config.serviceKey,true)},signal);
    if(!response.ok)fail(503,'database_unavailable');
    const data=await json(response);if(!Array.isArray(data)||data.length>1)fail(502,'invalid_upstream_response');return data[0]??null;
  }
  return {
    async authenticate(token,signal) {
      const response=await request('/auth/v1/user',{headers:headers(token)},signal);
      if(response.status===401||response.status===403)fail(401,'invalid_access_token');
      if(!response.ok)fail(503,'authentication_unavailable');
      const user=await json(response);if(!uuid(user?.id))fail(401,'invalid_access_token');return {id:user.id};
    },
    async isAdmin(token,signal) {
      const response=await request('/rest/v1/rpc/get_my_admin_status',{method:'POST',headers:headers(token),body:'{}'},signal);
      if(!response.ok)fail(503,'authorization_unavailable');return (await json(response))===true;
    },
    getReport:(id,signal)=>rows('reports',{select:'id,user_id,photo_path,workflow_status,photo_width,photo_height',id:`eq.${id}`},signal),
    getInsect:(id,signal)=>rows('report_insects',{select:'id,report_id,revision,active,box',id:`eq.${id}`},signal),
    getDetection:(id,signal)=>rows('report_identifications',{select:'report_id,status,image_width,image_height,detections,updated_at',report_id:`eq.${id}`},signal),
    getPhotoHash:(id,signal)=>rows('report_photo_hashes',{select:'report_id,sha256',report_id:`eq.${id}`},signal),
    getSettings:signal=>rows('verification_engine_settings',{select:'live_enabled',singleton:'eq.true'},signal),
    getModel:(sha,signal)=>rows('death_model_versions',{select:'sha256,version,preprocessing_version',sha256:`eq.${sha}`},signal),
    findPrediction:(key,signal)=>rows('insect_model_predictions',{select:'id,report_id,insect_id,box_revision,raw_dead_score,predicted_life_status,model_sha256,model_version,preprocessing_version,provenance,inference_runtime,runtime_version,source_image_sha256,inference_at',idempotency_key:`eq.server:${key}`},signal),
    async downloadPhoto(path,signal) {
      const encoded=path.split('/').map(encodeURIComponent).join('/');
      const response=await request(`/storage/v1/object/authenticated/report-photos/${encoded}`,{headers:headers(config.serviceKey,true)},signal);
      if(!response.ok)fail(503,'photo_unavailable');
      if(!/^image\/jpeg(?:;|$)/i.test(response.headers.get('content-type')??''))fail(422,'invalid_stored_image');
      return boundedBytes(response,5*1024*1024);
    },
    async savePrediction(args,signal) {
      const response=await request('/rest/v1/rpc/record_trusted_model_prediction',{
        method:'POST',headers:headers(config.serviceKey,true),body:JSON.stringify(args),
      },signal);
      if(!response.ok){
        // Error bodies may contain SQL details: never send them to a caller/log.
        await response.body?.cancel();return null;
      }
      const id=await json(response);if(!uuid(id))fail(502,'invalid_upstream_response');return id;
    },
  };
}
