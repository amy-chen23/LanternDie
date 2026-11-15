import test from 'node:test';
import assert from 'node:assert/strict';
import { canScoreLocally, scoreLanternflies } from '../lib/death-runtime.web.ts';

test('browser adapter initializes lazily, shares a worker, validates replies and recovers from failure', async () => {
  const original = globalThis.Worker;
  const workers = [];
  class FakeWorker {
    constructor(url, options) { this.url = url; this.options = options; this.messages = []; workers.push(this); }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
    reply(scores, error) { this.onmessage({ data: { id: this.messages.at(-1).id, scores, error } }); }
  }
  globalThis.Worker = FakeWorker;
  const photo = new Uint8Array([1,2,3]), boxes = [{x:0,y:0,width:1,height:1}];
  try {
    assert.equal(canScoreLocally(), true);
    assert.equal(workers.length,0);
    const first = scoreLanternflies(photo,1,1,boxes);
    assert.equal(workers[0].url,'/inference/death-worker.js');
    workers[0].reply([0.99]);
    assert.deepEqual(await first,[0.99]);
    const invalid = scoreLanternflies(photo,1,1,boxes);
    workers[0].reply([NaN]);
    await assert.rejects(invalid,/inference_failed/);
    const failed = scoreLanternflies(photo,1,1,boxes);
    workers[0].onerror();
    await assert.rejects(failed,/inference_failed/);
    assert.equal(workers[0].terminated,true);
    const retry = scoreLanternflies(photo,1,1,boxes);
    assert.equal(workers.length,2);
    workers[1].reply([0.1]);
    assert.deepEqual(await retry,[0.1]);
    const wrongCount = scoreLanternflies(photo,1,1,boxes);
    workers[1].reply([0.1,0.2]);
    await assert.rejects(wrongCount,/inference_failed/);
    const timeout = scoreLanternflies(photo,1,1,boxes);
    workers[1].onmessageerror();
    await assert.rejects(timeout,/inference_failed/);
    globalThis.Worker = undefined;
    assert.equal(canScoreLocally(),false);
    await assert.rejects(scoreLanternflies(photo,1,1,boxes),/inference_failed/);
  } finally { globalThis.Worker = original; }
});
