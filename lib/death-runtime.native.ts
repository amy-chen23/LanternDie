import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import jpeg from 'jpeg-js';
import { NativeModules } from 'react-native';
import { hasNativeRuntime, loadNativeRuntime } from './death-availability';
import model from '../assets/models/model.json';
import { paddedCrop, prepareCrop } from './death-policy';
import type { Box } from './death-policy';

let ready: Promise<import('onnxruntime-react-native').InferenceSession> | undefined;
function installedApi() { return (globalThis as typeof globalThis & { OrtApi?: unknown }).OrtApi; }
export function canScoreLocally() { return hasNativeRuntime(NativeModules.Onnxruntime, installedApi()); }
async function session() {
  if (!ready) ready = (async () => {
    const ort = await loadNativeRuntime(NativeModules.Onnxruntime, installedApi(), () => import('onnxruntime-react-native'));
    const asset = await Asset.fromModule(require('../assets/models/lanternfly-dead.onnx')).downloadAsync();
    if (!asset.localUri) throw new Error('model_unavailable');
    const bytes = await new File(asset.localUri).bytes();
    const hash = new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
    const checksum = Array.from(hash, b => b.toString(16).padStart(2, '0')).join('');
    if (checksum !== model.sha256) throw new Error('model_checksum_mismatch');
    const loaded = await ort.InferenceSession.create(asset.localUri.replace(/^file:\/\//, ''));
    const output = await loaded.run({ rgb: new ort.Tensor('float32', new Float32Array(224 * 224 * 3), [1, 224, 224, 3]) });
    const testScore = Number(output.dead_score.data[0]);
    if (!Number.isFinite(testScore) || Math.abs(testScore - model.self_test.dead_score) > model.self_test.absolute_tolerance) {
      await loaded.release();
      throw new Error('model_self_test_failed');
    }
    return loaded;
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}

export async function scoreLanternflies(photo: Uint8Array, width: number, height: number, boxes: Box[]): Promise<number[]> {
  if (!boxes.length || boxes.length > 20) throw new Error('unsupported_detection_count');
  const loaded = await session();
  const ort = await import('onnxruntime-react-native');
  const image = jpeg.decode(photo, { useTArray: true, maxResolutionInMP: 4, maxMemoryUsageInMB: 96 });
  if (image.width !== width || image.height !== height) throw new Error('image_dimension_mismatch');
  const scores: number[] = [];
  for (const box of boxes) {
    const input = prepareCrop(image.data, width, height, paddedCrop(box, width, height));
    const result = await loaded.run({ rgb: new ort.Tensor('float32', input, [1, 224, 224, 3]) });
    const score = Number(result.dead_score.data[0]);
    if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('invalid_model_output');
    scores.push(score);
  }
  return scores;
}
