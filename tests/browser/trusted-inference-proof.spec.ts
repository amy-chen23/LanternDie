import { test,expect } from '@playwright/test';
import { readFileSync,writeFileSync } from 'node:fs';
const reference=JSON.parse(readFileSync('docs/milestone-2a-native-parity.json','utf8'));
test('shadow Node native scores match actual browser worker for padded full and interior crops',async({page, browserName}, testInfo)=>{
 await page.goto('/__inference_test');
 const comparisons=[];
 for(const ref of reference.comparisons) {
  const bytes=[...readFileSync(`tests/fixtures/browser-inference/${ref.file}`)];
  const score=await page.evaluate(({bytes,ref})=>new Promise<number>((resolve,reject)=>{
   const worker=new Worker('/inference/death-worker.js',{type:'module'});
   worker.onerror=event=>{worker.terminate();reject(Error(event.message));};
   worker.onmessage=({data})=>{worker.terminate();if(data.error)reject(Error(data.error));else resolve(data.scores[0]);};
   worker.postMessage({id:1,photo:new Uint8Array(bytes),width:ref.width,height:ref.height,boxes:[ref.box]});
  }),{bytes,ref});
  const absoluteError=Math.abs(score-ref.nativeScore);
  expect(absoluteError).toBeLessThan(1e-5);
  expect(score>=0.98).toBe(ref.nativeScore>=0.98); // Legacy compatibility only; proof never assigns a label.
  comparisons.push({key:ref.key,native:ref.nativeScore,browser:score,absoluteError});
 }
 const evidence=JSON.stringify({kind:`actual ${browserName} production worker versus local native proof`,project:testInfo.project.name,modelSha256:reference.modelSha256,comparisons,maxAbsoluteError:Math.max(...comparisons.map(row=>row.absoluteError)),legacyThresholdDecisionMismatches:0},null,2)+'\n';
 await testInfo.attach('model-parity', {body:evidence,contentType:'application/json'});
 // Preserve the historical desktop reference when running the multi-engine matrix.
 if(browserName==='chromium' && (!testInfo.project.name || testInfo.project.name==='chromium-desktop')) writeFileSync('docs/milestone-2a-browser-parity.json',evidence);
});
