import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDetectionResponse } from '../supabase/functions/identify-report/detection.ts';

const classes = ['Adult Spotted Lanternfly', 'Early Nymph Spotted Lanternfly', 'Late Nymph Spotted Lanternfly'];
const box = { x: 100, y: 50, width: 40, height: 20, confidence: 0.8, class: classes[0] };
const response = predictions => ({ image: { width: 200, height: 100 }, predictions });

test('converts center coordinates to top-left pixels without changing image dimensions', () => {
  assert.deepEqual(parseDetectionResponse(response([box]), classes, 0.5), {
    image_width: 200, image_height: 100,
    detections: [{ label: classes[0], confidence: 0.8, x: 80, y: 40, width: 40, height: 20 }],
  });
});

test('retains multiple life stages and includes the exact detection threshold', () => {
  const result = parseDetectionResponse(response([box, { ...box, class: classes[1], confidence: 0.5 }]), classes, 0.5);
  assert.equal(result.detections.length, 2);
  assert.equal(result.detections[1].label, classes[1]);
});

test('filters non-lanternflies and low confidence detections', () => {
  const result = parseDetectionResponse(response([
    { ...box, class: 'moth' }, { ...box, confidence: 0.499 },
  ]), classes, 0.5);
  assert.deepEqual(result.detections, []);
});

test('zero detections is a valid result', () => {
  assert.deepEqual(parseDetectionResponse(response([]), classes, 0.5).detections, []);
});

test('clips partially outside boxes and discards fully outside boxes', () => {
  const result = parseDetectionResponse(response([
    { ...box, x: 0, y: 0 }, { ...box, x: 200, y: 100 }, { ...box, x: 300 },
  ]), classes, 0.5);
  assert.deepEqual(result.detections.map(({ x, y, width, height }) => ({ x, y, width, height })), [
    { x: 0, y: 0, width: 20, height: 10 }, { x: 180, y: 90, width: 20, height: 10 },
  ]);
});

test('malformed API output fails rather than declaring no lanternfly detected', () => {
  for (const invalid of [
    null, {}, { predictions: [] }, { image: { width: 0, height: 100 }, predictions: [] },
    { image: { width: 200, height: 100 }, predictions: {} },
    response([{ ...box, confidence: 80 }]), response([{ ...box, x: NaN }]),
    response([{ ...box, width: -1 }]), response([{ class: classes[0], confidence: 0.9 }]),
    response(Array(1001).fill(box)),
  ]) assert.throws(() => parseDetectionResponse(invalid, classes, 0.5), /Invalid detection response/);
});
