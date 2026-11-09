export type Box = { x: number; y: number; width: number; height: number };
export type Crop = { x: number; y: number; width: number; height: number };
export const preprocessingVersion = 'padded-rgb-pillow-bilinear-v1';

export function paddedCrop(box: Box, width: number, height: number): Crop {
  if (![width, height, box.x, box.y, box.width, box.height].every(Number.isFinite)
      || width <= 0 || height <= 0 || box.width <= 0 || box.height <= 0) throw new Error('Invalid crop');
  const x = Math.max(0, Math.floor(box.x - box.width * 0.15));
  const y = Math.max(0, Math.floor(box.y - box.height * 0.15));
  const right = Math.min(width, Math.floor(box.x + box.width * 1.15 + 1));
  const bottom = Math.min(height, Math.floor(box.y + box.height * 1.15 + 1));
  if (right <= x || bottom <= y) throw new Error('Empty crop');
  return { x, y, width: right - x, height: bottom - y };
}

// Python/Pillow uses round-to-even for aspect-ratio and centered-padding sizes.
function roundEven(value: number) {
  const base = Math.floor(value);
  return value - base === 0.5 ? base + base % 2 : Math.round(value);
}

function coefficients(input: number, output: number) {
  const scale = input / output;
  const filterScale = Math.max(1, scale);
  return Array.from({ length: output }, (_, i) => {
    const center = (i + 0.5) * scale;
    const start = Math.max(0, Math.floor(center - filterScale + 0.5));
    const end = Math.min(input, Math.floor(center + filterScale + 0.5));
    const weights = Array.from({ length: end - start }, (_, j) => Math.max(0, 1 - Math.abs((j + start - center + 0.5) / filterScale)));
    const total = weights.reduce((a, b) => a + b, 0);
    return { start, weights: weights.map(weight => Math.floor(weight / total * 4194304 + 0.5)) };
  });
}

/** RGBA JPEG pixels -> padded RGB float32. Matches Pillow's separable bilinear filter. */
export function prepareCrop(rgba: Uint8Array, width: number, height: number, crop: Crop): Float32Array {
  if (rgba.length !== width * height * 4 || ![width, height, crop.x, crop.y, crop.width, crop.height].every(Number.isInteger)
      || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0
      || crop.x + crop.width > width || crop.y + crop.height > height) throw new Error('Invalid pixels');
  let w = 224, h = 224;
  if (crop.width > crop.height) h = Math.max(1, roundEven(crop.height / crop.width * 224));
  else if (crop.height > crop.width) w = Math.max(1, roundEven(crop.width / crop.height * 224));
  const horizontal = coefficients(crop.width, w), vertical = coefficients(crop.height, h);
  const intermediate = new Uint8Array(w * crop.height * 3);
  for (let y = 0; y < crop.height; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    const kernel = horizontal[x];
    let sum = 2097152;
    for (let k = 0; k < kernel.weights.length; k++) sum += kernel.weights[k] * rgba[((y + crop.y) * width + crop.x + kernel.start + k) * 4 + c];
    intermediate[(y * w + x) * 3 + c] = Math.max(0, Math.min(255, Math.floor(sum / 4194304)));
  }
  const output = new Float32Array(224 * 224 * 3);
  for (let i = 0; i < output.length; i += 3) output.set([124, 116, 104], i);
  const left = roundEven((224 - w) / 2), top = roundEven((224 - h) / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    const kernel = vertical[y];
    let sum = 2097152;
    for (let k = 0; k < kernel.weights.length; k++) sum += kernel.weights[k] * intermediate[((kernel.start + k) * w + x) * 3 + c];
    output[((y + top) * 224 + x + left) * 3 + c] = Math.max(0, Math.min(255, Math.floor(sum / 4194304)));
  }
  return output;
}

export function proposedRoute(scores: number[], threshold: number, automaticEnabled = false) {
  const valid = scores.length > 0 && scores.every(s => Number.isFinite(s) && s >= 0 && s <= 1);
  return automaticEnabled && valid && scores.every(s => s >= threshold) ? 'likely_dead' : 'community_verification';
}
