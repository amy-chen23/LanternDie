import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';
import { paddedCrop, prepareCrop, preprocessingVersion } from '../../lib/death-policy.ts';
import { fail } from './errors.mjs';
export const RUNTIME_VERSION='1.24.3';
export const RUNTIME_NAME='vercel-node-shadow-only-v1';
/** One lazily loaded native session; never initialized for unauthenticated input. */
export function createClassifier({ modelPath, metadata, loadRuntime=()=>import('onnxruntime-node') }) {
  let ready;
  async function initialize() {
    if(!ready) ready=(async()=>{
      const module=await loadRuntime();const ort=module.default??module;
      if((ort.env.versions.node??ort.env.versions.common)!==RUNTIME_VERSION)fail(503,'runtime_version_mismatch');
      const bytes=await readFile(modelPath);
      if(createHash('sha256').update(bytes).digest('hex')!==metadata.sha256)fail(503,'model_checksum_mismatch');
      if(preprocessingVersion!=='padded-rgb-pillow-bilinear-v1')fail(503,'preprocessing_mismatch');
      const session=await ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1});
      const output=await session.run({rgb:new ort.Tensor('float32',new Float32Array(224*224*3),[1,224,224,3])});
      const score=Number(output.dead_score?.data[0]);
      if(!Number.isFinite(score)||Math.abs(score-metadata.self_test.dead_score)>metadata.self_test.absolute_tolerance){await session.release();fail(503,'model_self_test_failed');}
      return {ort,session};
    })().catch(error=>{ready=undefined;throw error;});
    return ready;
  }
  return {
    async score(photo,width,height,box,signal) {
      if(signal?.aborted)fail(503,'request_timeout');
      if(!(photo instanceof Uint8Array)||photo.length<4||photo.length>5*1024*1024||photo[0]!==255||photo[1]!==216)fail(422,'invalid_stored_image');
      let image;
      try {image=jpeg.decode(photo,{useTArray:true,maxResolutionInMP:4,maxMemoryUsageInMB:96});}
      catch{fail(422,'invalid_stored_image');}
      if(image.width!==width||image.height!==height)fail(409,'image_dimensions_changed');
      const input=prepareCrop(image.data,width,height,paddedCrop(box,width,height));
      const {ort,session}=await initialize();
      if(signal?.aborted)fail(503,'request_timeout');
      const output=await session.run({rgb:new ort.Tensor('float32',input,[1,224,224,3])});
      if(signal?.aborted)fail(503,'request_timeout');
      const score=Number(output.dead_score?.data[0]);
      if(!Number.isFinite(score)||score<0||score>1)fail(503,'invalid_model_output');
      return score;
    },
    async release(){if(ready){const loaded=await ready;await loaded.session.release();ready=undefined;}},
  };
}
