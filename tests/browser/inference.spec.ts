import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { proposedRoute } from '../../lib/death-policy';
import policy from '../../assets/models/policy.json';
const fixtures = pathToFileURL(resolve('tests/fixtures/browser-inference') + '/');
const references = JSON.parse(readFileSync(new URL('references.json', fixtures), 'utf8'));

async function predict(page: import('@playwright/test').Page, reference: typeof references[number], options: { invalid?: boolean; width?: number; workerRoot?: string } = {}) {
  const bytes = options.invalid ? [1,2,3] : [...readFileSync(new URL(reference.file, fixtures))];
  return page.evaluate(({ bytes, reference, options }) => new Promise<{ scores?: number[]; error?: string }>((resolve,reject) => {
    const worker = new Worker(`${options.workerRoot ?? ''}/inference/death-worker.js`, { type: 'module' });
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
    worker.onmessage = event => { worker.terminate(); resolve(event.data); };
    worker.postMessage({ id: 1, photo: new Uint8Array(bytes), width: options.width ?? reference.width, height: reference.height,
      boxes: [{ x:0, y:0, width:reference.width, height:reference.height }] });
  }), { bytes, reference, options });
}

test('production worker initializes and real JPEG scores agree with PyTorch on both sides of threshold', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/__inference_test');
  for (const reference of references) {
    const result = await predict(page, reference);
    expect(result.error).toBeUndefined();
    // Independent JPEG decoders can differ by a few RGB levels. Check score
    // tolerance as well as exact threshold decisions, rather than pixel equality.
    expect(Math.abs(result.scores![0] - reference.pytorch)).toBeLessThan(0.001);
    expect(result.scores![0] >= policy.threshold).toBe(reference.pytorch >= policy.threshold);
    expect(proposedRoute(result.scores!, policy.threshold, policy.automaticVerificationEnabled)).toBe('community_verification');
  }
  expect(requests.some(url => url.endsWith('.wasm'))).toBe(true);
  expect(requests.some(url => url.endsWith('.onnx'))).toBe(true);
  expect(requests.every(url => url.startsWith('http://127.0.0.1:4173/'))).toBe(true);
});

test('invalid JPEG and mismatched dimensions fail gracefully', async ({ page }) => {
  await page.goto('/__inference_test');
  expect((await predict(page, references[0], { invalid: true })).error).toBe('inference_failed');
  expect((await predict(page, references[0], { width: references[0].width+1 })).error).toBe('inference_failed');
});

for (const asset of ['lanternfly-dead.onnx','ort-wasm-simd-threaded.wasm']) test(`missing ${asset} returns failure without external fallback`, async ({ page }) => {
  const workerRoot = asset.endsWith('.onnx') ? '/__missing-model' : '/__missing-wasm';
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/__inference_test');
  expect((await page.request.get(`${workerRoot}/inference/${asset}`)).status()).toBe(404);
  expect((await predict(page,references[0],{ workerRoot })).error).toBe('inference_failed');
  expect(requests.every(url => url.startsWith('http://127.0.0.1:4173/'))).toBe(true);
});

test('corrupt model fails its checksum', async ({ page }) => {
  await page.route('**/inference/lanternfly-dead.onnx', route => route.fulfill({ body:'corrupt' }));
  await page.goto('/__inference_test');
  expect((await predict(page,references[0])).error).toBe('inference_failed');
});

test('production app shell loads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name:'Continue with Google' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('one worker reuses its initialized session across predictions and keeps the page responsive', async ({ page }) => {
  let downloads = 0;
  page.on('request', request => { if (request.url().endsWith('.onnx')) downloads++; });
  await page.goto('/__inference_test');
  const reference = references[0];
  const bytes = [...readFileSync(new URL(reference.file, fixtures))];
  const scores = await page.evaluate(({ reference, bytes }) => new Promise<number[]>((resolve,reject) => {
    const worker = new Worker('/inference/death-worker.js', {type:'module'});
    const scores: number[] = [];
    let ticks = 0;
    const timer = setInterval(() => ticks++, 1);
    worker.onerror = event => { clearInterval(timer); worker.terminate(); reject(new Error(event.message)); };
    worker.onmessage = ({data}) => {
      if (data.error) { clearInterval(timer); worker.terminate(); reject(new Error(data.error)); return; }
      scores.push(data.scores[0]);
      if (scores.length === 2) {
        clearInterval(timer); worker.terminate();
        if (!ticks) reject(new Error('UI timer did not run')); else resolve(scores);
      }
    };
    for (const id of [1,2]) worker.postMessage({id,photo:new Uint8Array(bytes),width:reference.width,height:reference.height,
      boxes:[{x:0,y:0,width:reference.width,height:reference.height}]});
  }), {reference, bytes});
  expect(scores[0]).toBe(scores[1]);
  expect(downloads).toBe(1);
});

test('phone startup stays within the JS budget and does not load inference assets', async ({ page, context }) => {
  await page.setViewportSize({ width:390, height:844 });
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate:4 });
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', {
    offline:false, latency:120, downloadThroughput:500_000, uploadThroughput:125_000,
  });
  const inferenceRequests: string[] = [];
  let appBytes = 0;
  page.on('request', request => { if (request.url().includes('/inference/')) inferenceRequests.push(request.url()); });
  page.on('response', response => {
    if (response.url().includes('/_expo/static/js/web/AppEntry')) appBytes = Number(response.headers()['content-length'] ?? 0);
  });
  await page.goto('/', { waitUntil:'domcontentloaded' });
  await expect(page.getByRole('button', { name:'Continue with Google' })).toBeVisible({ timeout:20_000 });
  const bytes = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => entry.name.includes('/_expo/static/js/web/AppEntry'))
    .reduce((sum, entry) => sum + (entry as PerformanceResourceTiming).decodedBodySize, 0));
  expect(bytes || appBytes).toBeGreaterThan(0);
  expect(bytes || appBytes).toBeLessThan(1_300_000);
  expect(inferenceRequests).toEqual([]);
});
