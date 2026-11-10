import assert from 'node:assert/strict';
import test from 'node:test';
import { hasNativeRuntime, loadNativeRuntime } from '../lib/death-availability.ts';

test('Expo Go never evaluates the ONNX module initializer when the bridge is absent', async () => {
  for (const bridge of [null, undefined, {}, { install: null }]) {
    let loaded = false;
    await assert.rejects(loadNativeRuntime(bridge, undefined, async () => {
      loaded = true;
      throw new TypeError("Cannot read property 'install' of null");
    }), /native_build_required/);
    assert.equal(loaded, false);
    assert.equal(hasNativeRuntime(bridge), false);
  }
});

test('custom builds can load the runtime through the bridge or an already installed API', async () => {
  for (const [bridge, api] of [[{ install() {} }, undefined], [null, {}]]) {
    let calls = 0;
    assert.equal(await loadNativeRuntime(bridge, api, async () => { calls++; return 'runtime'; }), 'runtime');
    assert.equal(calls, 1);
  }
});
