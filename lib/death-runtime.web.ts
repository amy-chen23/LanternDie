import type { Box } from './death-policy';

let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<number, { resolve: (scores: number[]) => void; reject: (error: Error) => void; count: number; timer: ReturnType<typeof setTimeout> }>();
export function canScoreLocally() {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' && !!globalThis.crypto?.subtle;
}
function stop() {
  worker?.terminate();
  worker = undefined;
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('inference_failed')); }
  pending.clear();
}
export async function scoreLanternflies(photo: Uint8Array, width: number, height: number, boxes: Box[]): Promise<number[]> {
  if (!canScoreLocally()) throw new Error('inference_failed');
  if (!worker) {
    worker = new Worker('/inference/death-worker.js', { type: 'module' });
    worker.onerror = stop;
    worker.onmessageerror = stop;
    worker.onmessage = ({ data }) => {
      const task = pending.get(data.id);
      if (!task) return;
      clearTimeout(task.timer);
      pending.delete(data.id);
      if (data.error || !Array.isArray(data.scores) || data.scores.length !== task.count
          || !data.scores.every((s: number) => Number.isFinite(s) && s >= 0 && s <= 1)) task.reject(new Error('inference_failed'));
      else task.resolve(data.scores);
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject, count: boxes.length, timer: setTimeout(stop, 120_000) });
    try { worker!.postMessage({ id, photo, width, height, boxes }); }
    catch { stop(); }
  });
}
