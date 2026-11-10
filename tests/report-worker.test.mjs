import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { authorizedWorker, processNextReport } from '../supabase/functions/process-report-jobs/processor.ts';

const config = { apiKey: 'private-key', modelId: 'detector/1', classes: ['lanternfly'], threshold: 0.5 };
const output = { image: { width: 100, height: 80 }, predictions: [
  { class: 'lanternfly', confidence: 0.9, x: 30, y: 20, width: 20, height: 10 },
] };
function fixture(overrides = {}) {
  const calls = [];
  const store = {
    claim: async () => ({ report_id: 'report', photo_path: 'owner/photo.jpg', lease_token: 'lease', attempts: 1 }),
    download: async path => { calls.push(['download', path]); return new Blob(['exact image bytes']); },
    prepare: async (job, hash) => { calls.push(['prepare', hash]); return true; },
    complete: async (job, result, model, threshold) => { calls.push(['complete', result, model, threshold]); },
    fail: async (job, code) => { calls.push(['fail', code]); },
    ...overrides,
  };
  const request = async (url, options) => {
    calls.push(['request', url, options]);
    return Response.json(output);
  };
  return { calls, store, request };
}

test('worker token must be configured, long, and exact', () => {
  const secret = 'a'.repeat(32);
  assert.equal(authorizedWorker(secret, secret), true);
  assert.equal(authorizedWorker(null, secret), false);
  assert.equal(authorizedWorker('a'.repeat(32), undefined), false);
  assert.equal(authorizedWorker('short', 'short'), false);
  assert.equal(authorizedWorker('b'.repeat(32), secret), false);
});
test('idle invocation does not download or call inference', async () => {
  const f = fixture({ claim: async () => null });
  assert.equal(await processNextReport(f.store, config, f.request), 'idle');
  assert.deepEqual(f.calls, []);
});
test('hashes actual downloaded bytes before inference and commits converted boxes', async () => {
  const f = fixture();
  assert.equal(await processNextReport(f.store, config, f.request), 'complete');
  assert.deepEqual(f.calls.map(call => call[0]), ['download', 'prepare', 'request', 'complete']);
  assert.equal(f.calls[1][1], createHash('sha256').update('exact image bytes').digest('hex'));
  const result = f.calls[3][1];
  assert.deepEqual(result.detections[0], { label: 'lanternfly', confidence: 0.9, x: 20, y: 15, width: 20, height: 10 });
  assert.equal(f.calls[3][2], 'detector/1');
});
test('duplicate does not consume detector inference', async () => {
  const f = fixture({ prepare: async () => false });
  assert.equal(await processNextReport(f.store, config, f.request), 'duplicate');
  assert.deepEqual(f.calls.map(call => call[0]), ['download']);
});
test('oversized photo is a technical failure and never reaches detector', async () => {
  const f = fixture({ download: async () => new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]) });
  await processNextReport(f.store, config, f.request);
  assert.deepEqual(f.calls, [['fail', 'photo_unavailable']]);
});
test('invalid configuration is isolated from retryable inference failure', async () => {
  const f = fixture();
  await processNextReport(f.store, { ...config, apiKey: '' }, f.request);
  assert.deepEqual(f.calls.at(-1), ['fail', 'configuration']);
  assert.equal(f.calls.some(call => call[0] === 'request'), false);
});
test('upstream errors are sanitized and cannot become no-detection results', async () => {
  const f = fixture();
  await processNextReport(f.store, config, async () => new Response('private upstream details', { status: 500 }));
  assert.deepEqual(f.calls.at(-1), ['fail', 'inference_failed']);
  assert.equal(f.calls.some(call => call[0] === 'complete'), false);
});
test('malformed output retries, valid empty output completes for admin routing', async () => {
  const malformed = fixture();
  await processNextReport(malformed.store, config, async () => Response.json({}));
  assert.deepEqual(malformed.calls.at(-1), ['fail', 'inference_failed']);
  const empty = fixture();
  await processNextReport(empty.store, config, async () => Response.json({ ...output, predictions: [] }));
  assert.deepEqual(empty.calls.at(-1)[1].detections, []);
});
test('exhausted abandoned job stops without downloading or charging for inference', async () => {
  const f = fixture({ claim: async () => ({ report_id: 'report', lease_token: 'lease', attempts: 6 }) });
  assert.equal(await processNextReport(f.store, config, f.request), 'failed');
  assert.deepEqual(f.calls, [['fail', 'worker_exhausted']]);
});
test('database interruption leaves recovery to durable lease when failure cannot be saved', async () => {
  const f = fixture({ complete: async () => { throw new Error('lost lease'); }, fail: async () => { throw new Error('lost lease'); } });
  await assert.rejects(processNextReport(f.store, config, f.request), /lost lease/);
});
