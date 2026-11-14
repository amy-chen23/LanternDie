import assert from 'node:assert/strict';
import test from 'node:test';
import { loadReportPhotoUrls } from '../lib/report-photo-urls.ts';

test('report photos are signed in one batch without downloading image bytes', async () => {
  const calls=[];
  const storage = {createSignedUrls:async (paths,seconds) => {
    calls.push({paths,seconds});
    return {data:paths.map(path=>({path,signedUrl:`https://storage.test/${path}`,error:null})),error:null};
  }};
  const photos=await loadReportPhotoUrls(storage,['a.jpg','b.jpg','a.jpg'],[],1000);
  assert.deepEqual(calls,[{paths:['a.jpg','b.jpg'],seconds:3600}]);
  assert.equal(photos.get('a.jpg').url,'https://storage.test/a.jpg');
});
test('unexpired signed photos are reused, while expired or missing photos are renewed',async () => {
  let requested;
  const storage={createSignedUrls:async paths=>{requested=paths;return {data:[],error:null};}};
  const previous=[{photo_path:'cached',photo_url:'https://cached',photo_url_expires_at:100000},
    {photo_path:'expired',photo_url:'https://expired',photo_url_expires_at:1000}];
  const photos=await loadReportPhotoUrls(storage,['cached','expired','new'],previous,2000);
  assert.deepEqual(requested,['expired','new']);
  assert.equal(photos.get('cached').url,'https://cached');
});
test('failed or unauthorized photo URLs do not prevent report metadata from rendering',async () => {
  assert.equal((await loadReportPhotoUrls({createSignedUrls:async()=>({data:null,error:new Error('offline')})},['a'])).size,0);
  const photos=await loadReportPhotoUrls({createSignedUrls:async()=>({data:[{path:'a',signedUrl:null,error:'denied'}],error:null})},['a']);
  assert.equal(photos.size,0);
});
