import { createHash } from 'node:crypto';
import { fail, uuid } from './errors.mjs';
import { RUNTIME_NAME, RUNTIME_VERSION } from './runtime.mjs';
export const PREPROCESSING='padded-rgb-pillow-bilinear-v1';
const hash=value=>createHash('sha256').update(value).digest('hex');
const sameBox=(a,b)=>a&&b&&['x','y','width','height'].every(k=>a[k]===b[k]);
function validateSource(input,report,insect,detection) {
  if(!insect||insect.report_id!==report.id||insect.id!==input.insectId)fail(404,'report_not_found');
  if(!insect.active||insect.revision!==input.revision)fail(409,'stale_insect_revision');
  if(report.workflow_status==='rejected'||!['pending_review','published','admin_review'].includes(report.workflow_status)
    ||detection?.status!=='detected'||!Array.isArray(detection.detections)||!detection.detections.some(box=>sameBox(box,insect.box)))fail(409,'accepted_detection_required');
  const width=detection.image_width,height=detection.image_height,box=insect.box;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>4_000_000
    ||![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.x<0||box.y<0||box.width<=0||box.height<=0
    ||box.x+box.width>width||box.y+box.height>height)fail(409,'invalid_source_geometry');
  if((report.photo_width!=null&&report.photo_width!==width)||(report.photo_height!=null&&report.photo_height!==height))fail(409,'image_dimensions_changed');
  if(typeof report.photo_path!=='string'||!report.photo_path.startsWith(`${report.user_id}/`)
    ||report.photo_path.split('/').some(part=>!part||part==='.'||part==='..')||/[\\?#\x00-\x1f]/.test(report.photo_path))fail(409,'invalid_source_path');
  if(typeof detection.updated_at!=='string'||!Number.isFinite(Date.parse(detection.updated_at)))fail(409,'invalid_detection_snapshot');
  return {width,height,box:{x:box.x,y:box.y,width:box.width,height:box.height}};
}
function matchesPrediction(prediction,identity) {
  return prediction?.report_id===identity.reportId&&prediction.insect_id===identity.insectId&&prediction.box_revision===identity.revision
    &&prediction.model_sha256===identity.modelSha256&&prediction.model_version===identity.modelVersion&&prediction.preprocessing_version===PREPROCESSING
    &&prediction.source_image_sha256===identity.imageSha256&&prediction.provenance==='server_trusted'
    &&prediction.inference_runtime===RUNTIME_NAME&&prediction.runtime_version===RUNTIME_VERSION&&prediction.predicted_life_status===null
    &&uuid(prediction.id)&&Number.isFinite(prediction.raw_dead_score)&&prediction.raw_dead_score>=0&&prediction.raw_dead_score<=1
    &&Number.isFinite(Date.parse(prediction.inference_at));
}
function result(prediction){return {shadowOnly:true,predictionId:prediction.id,reportId:prediction.report_id,insectId:prediction.insect_id,
 revision:prediction.box_revision,rawDeadScore:prediction.raw_dead_score,predictedLifeStatus:null,modelVersion:prediction.model_version,
 modelSha256:prediction.model_sha256,preprocessingVersion:prediction.preprocessing_version,sourceImageSha256:prediction.source_image_sha256,
 inferenceAt:prediction.inference_at,provenance:'server_trusted',runtime:RUNTIME_NAME,runtimeVersion:RUNTIME_VERSION};}
/** Authentication/authorization happens separately for EVERY request, including replay. */
export function createInferenceService({metadata,classifier,allowedUserIds,maxPending=2}) {
  const inFlight=new Map();let active=0;
  return async function infer(input,token,store,signal) {
    const user=await store.authenticate(token,signal);
    if(!allowedUserIds.has(user.id))fail(403,'user_not_allowlisted');
    const report=await store.getReport(input.reportId,signal);
    if(!report||report.id!==input.reportId)fail(404,'report_not_found');
    if(report.user_id!==user.id&&!await store.isAdmin(token,signal))fail(404,'report_not_found');
    const [insect,detection,photoHash,settings,model]=await Promise.all([
      store.getInsect(input.insectId,signal),store.getDetection(report.id,signal),store.getPhotoHash(report.id,signal),
      store.getSettings(signal),store.getModel(metadata.sha256,signal),
    ]);
    const source=validateSource(input,report,insect,detection);
    if(!settings||settings.live_enabled!==false)fail(503,'shadow_foundation_required');
    if(!model||model.sha256!==metadata.sha256||model.preprocessing_version!==PREPROCESSING||typeof model.version!=='string')fail(503,'registered_model_mismatch');
    if(!/^[a-f0-9]{64}$/.test(photoHash?.sha256??''))fail(409,'registered_photo_hash_required');
    const identity={reportId:report.id,insectId:insect.id,revision:insect.revision,modelSha256:metadata.sha256,modelVersion:model.version,
      imageSha256:photoHash.sha256,box:source.box,detectorUpdatedAt:detection.updated_at,runtimeVersion:RUNTIME_VERSION,preprocessing:PREPROCESSING};
    const key=`shadow-poc-v1:${hash(JSON.stringify(identity))}`;
    const cached=await store.findPrediction(key,signal);
    if(cached){if(!matchesPrediction(cached,identity))fail(409,'prediction_identity_conflict');return result(cached);}
    if(inFlight.has(key))return inFlight.get(key);
    if(active>=maxPending)fail(429,'inference_capacity_reached');
    active++;
    // Serial execution bounds decoded images/native tensor allocations per instance.
    const previous=[...inFlight.values()].at(-1)??Promise.resolve();
    const task=(async()=>{
      await previous.catch(()=>{});if(signal?.aborted)fail(503,'request_timeout');
      const photo=await store.downloadPhoto(report.photo_path,signal);
      if(hash(photo)!==photoHash.sha256)fail(409,'source_image_checksum_mismatch');
      const score=await classifier.score(photo,source.width,source.height,source.box,signal);
      if(!Number.isFinite(score)||score<0||score>1)fail(503,'invalid_model_output');
      const [currentReport,currentInsect,currentDetection]=await Promise.all([
        store.getReport(input.reportId,signal),store.getInsect(input.insectId,signal),store.getDetection(report.id,signal),
      ]);
      if(!currentReport||currentReport.user_id!==report.user_id||currentReport.photo_path!==report.photo_path
        ||currentDetection?.updated_at!==detection.updated_at||!sameBox(currentInsect?.box,source.box))fail(409,'source_snapshot_changed');
      validateSource(input,currentReport,currentInsect,currentDetection);
      if(signal?.aborted)fail(503,'request_timeout');
      const at=new Date().toISOString();
      const args={p_insect_id:insect.id,p_revision:insect.revision,p_model_sha256:metadata.sha256,p_raw_dead_score:score,
        p_predicted_life_status:null,p_runtime:RUNTIME_NAME,p_runtime_version:RUNTIME_VERSION,p_inference_at:at,
        p_image_sha256:photoHash.sha256,p_key:key};
      const id=await store.savePrediction(args,signal);
      // Across instances, M1's immutable RPC may reject a timestamp-different retry.
      // Read and validate the database winner rather than overwrite/replay evidence.
      const persisted=await store.findPrediction(key,signal);
      if(!persisted){
        const latest=await store.getInsect(input.insectId,signal);
        if(!latest||!latest.active||latest.revision!==input.revision)fail(409,'stale_insect_revision');
        fail(503,'prediction_not_persisted');
      }
      if(!matchesPrediction(persisted,identity)||(id&&id!==persisted.id))fail(409,'prediction_identity_conflict');
      return result(persisted);
    })().finally(()=>{active--;inFlight.delete(key);});
    inFlight.set(key,task);return task;
  };
}
