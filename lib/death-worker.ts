// This entire module executes in a dedicated worker, including JPEG decoding.
import * as ort from 'onnxruntime-web/wasm';
import jpeg from 'jpeg-js';
import model from '../assets/models/model.json';
import { paddedCrop, prepareCrop } from './death-policy';
import type { Box } from './death-policy';

ort.env.wasm.numThreads = 1; // No SharedArrayBuffer or cross-origin isolation required.
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = new URL('./', self.location.href).href;
let ready: Promise<ort.InferenceSession> | undefined;
async function session() {
  if (!ready) ready = (async () => {
    const response = await fetch(new URL('./lanternfly-dead.onnx', self.location.href));
    if (!response.ok) throw new Error('model_unavailable');
    const bytes = await response.arrayBuffer();
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (Array.from(hash, b => b.toString(16).padStart(2, '0')).join('') !== model.sha256) throw new Error('model_checksum_mismatch');
    const loaded = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    const output = await loaded.run({ rgb: new ort.Tensor('float32', new Float32Array(224 * 224 * 3), [1, 224, 224, 3]) });
    const score = Number(output.dead_score?.data[0]);
    if (!Number.isFinite(score) || Math.abs(score - model.self_test.dead_score) > model.self_test.absolute_tolerance) {
      await loaded.release();
      throw new Error('model_self_test_failed');
    }
    return loaded;
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}
async function predict(photo: Uint8Array, width: number, height: number, boxes: Box[]) {
  if (!(photo instanceof Uint8Array) || !photo.length || photo.length > 5 * 1024 * 1024
      || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > 4_000_000
      || !Array.isArray(boxes) || !boxes.length || boxes.length > 20) throw new Error('invalid_image');
  for (const box of boxes) {
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.x < 0 || box.y < 0
        || box.width <= 0 || box.height <= 0 || box.x + box.width > width || box.y + box.height > height) throw new Error('invalid_crop');
  }
  const image = jpeg.decode(photo, { useTArray: true, maxResolutionInMP: 4, maxMemoryUsageInMB: 96 });
  if (image.width !== width || image.height !== height) throw new Error('image_dimension_mismatch');
  const loaded = await session();
  const scores: number[] = [];
  for (const box of boxes) {
    const input = prepareCrop(image.data, width, height, paddedCrop(box, width, height));
    const output = await loaded.run({ rgb: new ort.Tensor('float32', input, [1, 224, 224, 3]) });
    const score = Number(output.dead_score?.data[0]);
    if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('invalid_model_output');
    scores.push(score);
  }
  return scores;
}
// Serialize requests to bound memory and avoid overlapping session.run calls.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      const scores = await predict(data.photo, data.width, data.height, data.boxes);
      self.postMessage({ id: data.id, scores });
    } catch {
      self.postMessage({ id: data.id, error: 'inference_failed' });
    }
  });
};
