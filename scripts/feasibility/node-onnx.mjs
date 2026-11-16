// Isolated local measurement, not a route/server and never imported by the app.
// ONNX_POC_RUNTIME_ROOT points to a temporary npm installation of onnxruntime-node.
import { createRequire } from 'node:module';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import jpeg from 'jpeg-js';
import { paddedCrop, prepareCrop } from '../../lib/death-policy.ts';
const requireRuntime = createRequire(path.resolve(process.env.ONNX_POC_RUNTIME_ROOT ?? '.', 'package.json'));
const started = performance.now();
const ort = requireRuntime('onnxruntime-node');
const runtimeImportMs = performance.now() - started;
const metadata = JSON.parse(await readFile('assets/models/model.json'));
const modelBytes = await readFile('assets/models/lanternfly-dead.onnx');
if (createHash('sha256').update(modelBytes).digest('hex') !== metadata.sha256) throw new Error('model_checksum');
const before = process.memoryUsage();
const init = performance.now();
const session = await ort.InferenceSession.create(modelBytes, {
  executionProviders: ['cpu'], intraOpNumThreads: 1, interOpNumThreads: 1,
});
const initializationMs = performance.now() - init;
const zero = new Float32Array(224 * 224 * 3);
const zeroScore = Number((await session.run({ rgb:new ort.Tensor('float32',zero,[1,224,224,3]) })).dead_score.data[0]);
if (Math.abs(zeroScore-metadata.self_test.dead_score)>metadata.self_test.absolute_tolerance) throw new Error('self_test');
const references=JSON.parse(await readFile('tests/fixtures/browser-inference/references.json'));
const scores=[];
const measurements=[];
let maxError=0;
for (const ref of references) {
  const photo=await readFile(`tests/fixtures/browser-inference/${ref.file}`);
  const begin=performance.now();
  const image=jpeg.decode(photo,{useTArray:true,maxResolutionInMP:4,maxMemoryUsageInMB:96});
  const input=prepareCrop(image.data,image.width,image.height,paddedCrop({x:0,y:0,width:image.width,height:image.height},image.width,image.height));
  const preprocessingMs=performance.now()-begin;
  if(process.env.ONNX_POC_TENSOR_PREFIX) await writeFile(`${process.env.ONNX_POC_TENSOR_PREFIX}-${ref.file}.f32`,Buffer.from(input.buffer,input.byteOffset,input.byteLength));
  const durations=[];
  let score;
  for(let i=0;i<25;i++) {
    const time=performance.now();
    score=Number((await session.run({rgb:new ort.Tensor('float32',input,[1,224,224,3])})).dead_score.data[0]);
    durations.push(performance.now()-time);
  }
  const error=Math.abs(score-ref.pytorch); maxError=Math.max(maxError,error);
  if(error>0.001 || (score>=0.98)!==(ref.pytorch>=0.98)) throw new Error('pytorch_reference_mismatch');
  durations.sort((a,b)=>a-b);
  measurements.push({file:ref.file,preprocessingMs,inferenceP50Ms:durations[12],inferenceP95Ms:durations[23]});
  scores.push({file:ref.file,pytorch:ref.pytorch,onnx:score,absoluteError:error});
}
// Upper image-size bound using a deterministic JPEG: resource measurement, not accuracy evidence.
const width=1600,height=1600,rgba=Buffer.alloc(width*height*4);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const i=(y*width+x)*4;rgba[i]=(x*17+y*13)%256;rgba[i+1]=(x*3+y*29)%256;rgba[i+2]=(x*41+y*7)%256;rgba[i+3]=255;
}
const stressPhoto=jpeg.encode({data:rgba,width,height},75).data;
if(process.env.ONNX_POC_STRESS_JPEG) await writeFile(process.env.ONNX_POC_STRESS_JPEG,stressPhoto);
const cpuStart=process.cpuUsage();const stressStart=performance.now();
const stress=jpeg.decode(stressPhoto,{useTArray:true,maxResolutionInMP:4,maxMemoryUsageInMB:96});
for(let i=0;i<20;i++){
 const input=prepareCrop(stress.data,width,height,paddedCrop({x:0,y:0,width,height},width,height));
 await session.run({rgb:new ort.Tensor('float32',input,[1,224,224,3])});
}
const cpu=process.cpuUsage(cpuStart);
const report={kind:'local-node-native-poc-not-a-vercel-deployment',node:process.version,platform:process.platform,arch:process.arch,
 modelSha256:metadata.sha256,modelBytes:(await stat('assets/models/lanternfly-dead.onnx')).size,
 runtimeVersion:requireRuntime('onnxruntime-node/package.json').version,runtimeImportMs,initializationMs,selfTestScore:zeroScore,
 measurements,scores,maxAbsoluteError:maxError,stress:{width,height,crops:20,jpegBytes:stressPhoto.length,wallMs:performance.now()-stressStart,cpuMs:(cpu.user+cpu.system)/1000},
 memoryBeforeSession:before,memoryAfterStress:process.memoryUsage(),maxRssKiB:process.resourceUsage().maxRSS};
await session.release();
console.log(JSON.stringify(report,null,2));
if(process.env.ONNX_POC_OUTPUT) await writeFile(process.env.ONNX_POC_OUTPUT,JSON.stringify(report,null,2)+'\n');
