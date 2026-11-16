// Explicit opt-in actual native model test. No mocked model scores in this file.
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import jpeg from 'jpeg-js';
import { paddedCrop,prepareCrop } from '../../lib/death-policy.ts';
import { createClassifier } from './runtime.mjs';
import { metadata } from './test-fixture.mjs';
const modelPath=new URL('../../assets/models/lanternfly-dead.onnx',import.meta.url);
const refs=JSON.parse(await readFile(new URL('../../tests/fixtures/browser-inference/references.json',import.meta.url)));
const prior=JSON.parse(await readFile(new URL('../../docs/trusted-inference-node22-measurements.json',import.meta.url)));
let loads=0;const comparisons=[];
const classifier=createClassifier({modelPath,metadata,loadRuntime:async()=>{loads++;return import('onnxruntime-node');}});
try {
 await assert.rejects(classifier.score(Buffer.from('invalid'),1,1,{x:0,y:0,width:1,height:1}),{code:'invalid_stored_image'});assert.equal(loads,0);
 for(const ref of refs) {
  const image=await readFile(new URL(`../../tests/fixtures/browser-inference/${ref.file}`,import.meta.url));
  const score=await classifier.score(image,ref.width,ref.height,{x:0,y:0,width:ref.width,height:ref.height});
  assert.ok(Math.abs(score-prior.scores.find(row=>row.file===ref.file).onnx)<1e-6);
  assert.ok(Math.abs(score-ref.pytorch)<0.001);assert.equal(score>=0.98,ref.pytorch>=0.98);
  for(const [kind,box] of [['full',{x:0,y:0,width:ref.width,height:ref.height}],['center',{x:12,y:9,width:80,height:90}]]) {
   const nativeScore=await classifier.score(image,ref.width,ref.height,box);
   const pixels=jpeg.decode(image,{useTArray:true,maxResolutionInMP:4,maxMemoryUsageInMB:96});
   const tensor=prepareCrop(pixels.data,ref.width,ref.height,paddedCrop(box,ref.width,ref.height));
   const key=`${ref.file}-${kind}`;
   await writeFile(`/private/tmp/lanterndie-m2a-tensor-${key}.f32`,Buffer.from(tensor.buffer,tensor.byteOffset,tensor.byteLength));
   comparisons.push({key,file:ref.file,width:ref.width,height:ref.height,box,nativeScore});
  }
  await assert.rejects(classifier.score(image,ref.width+1,ref.height,{x:0,y:0,width:1,height:1}),{code:'image_dimensions_changed'});
 }
 assert.equal(loads,1,'One native session per classifier instance');
 const photo=await readFile(new URL('../../tests/fixtures/browser-inference/above.jpg',import.meta.url));
 for(const [mutate,code] of [[m=>({...m,sha256:'0'.repeat(64)}),'model_checksum_mismatch'],[m=>({...m,self_test:{...m.self_test,dead_score:0.5}}),'model_self_test_failed']]) {
  const bad=createClassifier({modelPath,metadata:mutate(metadata)});
  await assert.rejects(bad.score(photo,135,203,{x:0,y:0,width:135,height:203}),{code});
  await bad.release();
 }
 const retry=createClassifier({modelPath,metadata,loadRuntime:async()=>{throw Error('load failed');}});
 await assert.rejects(retry.score(photo,135,203,{x:0,y:0,width:135,height:203}));
 await assert.rejects(retry.score(photo,135,203,{x:0,y:0,width:135,height:203}));
 await writeFile('docs/milestone-2a-native-parity.json',JSON.stringify({modelSha256:metadata.sha256,comparisons,scores:comparisons.map(r=>({file:r.key,onnx:r.nativeScore}))},null,2)+'\n');
 console.log('PASS actual native loading, session reuse, two real JPEG references, dimension errors, checksum/self-test failures, load retry.');
}finally{await classifier.release();}
