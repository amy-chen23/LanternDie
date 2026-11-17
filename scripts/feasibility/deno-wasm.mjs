// Generic Deno compatibility probe. This does not emulate Supabase's CPU/memory sandbox.
import jpeg from '../../node_modules/jpeg-js/index.js';
import { paddedCrop, prepareCrop } from '../../lib/death-policy.ts';
import * as ort from '../../node_modules/onnxruntime-web/dist/ort.wasm.min.mjs';
const root=new URL('../../',import.meta.url);
ort.env.wasm.numThreads=1;
ort.env.wasm.proxy=false;
ort.env.wasm.wasmPaths={mjs:new URL('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',root).href,
 wasm:new URL('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',root).href};
const metadata=JSON.parse(await Deno.readTextFile(new URL('assets/models/model.json',root)));
const bytes=await Deno.readFile(new URL('assets/models/lanternfly-dead.onnx',root));
const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
if(Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('')!==metadata.sha256)throw new Error('model_checksum');
const start=performance.now();
const session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
const initializationMs=performance.now()-start;
const input=new ort.Tensor('float32',new Float32Array(224*224*3),[1,224,224,3]);
const durations=[];let score;
for(let i=0;i<20;i++){
 const time=performance.now();score=Number((await session.run({rgb:input})).dead_score.data[0]);durations.push(performance.now()-time);
}
if(Math.abs(score-metadata.self_test.dead_score)>metadata.self_test.absolute_tolerance)throw new Error('self_test');
let stress=null;
const stressPath=Deno.env.get('ONNX_POC_STRESS_JPEG');
if(stressPath){
 const photo=await Deno.readFile(stressPath);const begin=performance.now();
 const image=jpeg.decode(photo,{useTArray:true,maxResolutionInMP:4,maxMemoryUsageInMB:96});
 const decodeMs=performance.now()-begin;
 for(let i=0;i<20;i++){
  const pixels=prepareCrop(image.data,image.width,image.height,paddedCrop({x:0,y:0,width:image.width,height:image.height},image.width,image.height));
  await session.run({rgb:new ort.Tensor('float32',pixels,[1,224,224,3])});
 }
 stress={width:image.width,height:image.height,crops:20,decodeMs,wallMs:performance.now()-begin,memory:Deno.memoryUsage()};
}
const report={kind:'generic-deno-wasm-poc-not-supabase-edge',deno:Deno.version,modelSha256:metadata.sha256,initializationMs,score,
 stress,crops:20,totalInferenceMs:durations.reduce((a,b)=>a+b,0),memory:Deno.memoryUsage()};
console.log(JSON.stringify(report,null,2));
const output=Deno.env.get('ONNX_POC_OUTPUT');if(output)await Deno.writeTextFile(output,JSON.stringify(report,null,2)+'\n');
await session.release();
