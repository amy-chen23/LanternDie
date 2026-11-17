import assert from 'node:assert/strict';
import test from 'node:test';
import { lanternflyThumbnailFrame } from '../lib/thumbnail-crop.ts';

const makeReport = (boxes, width = 400, height = 300) => ({
  insects_ready: false, insects: [], identification: { status: 'detected', image_width: width, image_height: height, detections: boxes },
});
const box = { x: 120, y: 80, width: 40, height: 60 };
const assertVisible = (frame, bounds, size = 144) => {
  const scale = frame.width / bounds.imageWidth;
  assert.ok(frame.left + bounds.x * scale >= -0.001);
  assert.ok(frame.top + bounds.y * scale >= -0.001);
  assert.ok(frame.left + (bounds.x + bounds.width) * scale <= size + 0.001);
  assert.ok(frame.top + (bounds.y + bounds.height) * scale <= size + 0.001);
};

test('centers a padded crop on the detection with uniform image scaling', () => {
  const frame = lanternflyThumbnailFrame(makeReport([box]), 144);
  assert.ok(frame.width > 144);
  assert.ok(Math.abs(frame.width / frame.height - 400 / 300) < 1e-10);
  assert.ok(Math.abs(frame.left + (box.x + box.width / 2) * frame.width / 400 - 72) < 0.001);
  assertVisible(frame, { ...box, imageWidth: 400 });
});

test('edge detections remain entirely visible without exposing space outside the image', () => {
  for (const [x, y] of [[0, 0], [370, 0], [0, 270], [370, 270]]) {
    const edge = { x, y, width: 30, height: 30 };
    const frame = lanternflyThumbnailFrame(makeReport([edge]), 144);
    assertVisible(frame, { ...edge, imageWidth: 400 });
    assert.ok(frame.left <= 0 && frame.top <= 0);
    assert.ok(frame.left + frame.width >= 144 - 0.001);
    assert.ok(frame.top + frame.height >= 144 - 0.001);
  }
});

test('frames all lanternflies together, including spread-out portrait detections', () => {
  const boxes = [{ x: 0, y: 0, width: 30, height: 40 }, { x: 80, y: 350, width: 30, height: 40 }];
  const frame = lanternflyThumbnailFrame(makeReport(boxes, 120, 400), 144);
  assert.ok(Math.abs(frame.width / frame.height - 120 / 400) < 1e-10);
  for (const bounds of boxes) assertVisible(frame, { ...bounds, imageWidth: 120 });
});

test('active boxes override raw detections and an authoritative empty set keeps the full photo', () => {
  const report = makeReport([{ x: 0, y: 0, width: 400, height: 300 }]);
  report.insects = [{ box }];
  assert.deepEqual(lanternflyThumbnailFrame(report, 144), lanternflyThumbnailFrame(makeReport([box]), 144));
  report.insects = [];
  report.insects_ready = true;
  assert.equal(lanternflyThumbnailFrame(report, 144), null);
});

test('missing dimensions fall back to loaded photo dimensions; unusable detections keep the full photo', () => {
  const report = makeReport([box], null, null);
  assert.equal(lanternflyThumbnailFrame(report, 144), null);
  assert.deepEqual(lanternflyThumbnailFrame(report, 144, { width: 400, height: 300 }), lanternflyThumbnailFrame(makeReport([box]), 144));
  for (const boxes of [[], [{ ...box, width: 0 }], [{ ...box, x: NaN }], [{ ...box, y: Infinity }], [{ ...box, x: 500 }]]) {
    assert.equal(lanternflyThumbnailFrame(makeReport(boxes), 144), null);
  }
  assert.equal(lanternflyThumbnailFrame(makeReport([box], 0), 144), null);
  assert.equal(lanternflyThumbnailFrame(makeReport([box]), 0), null);
});

test('clips partially out-of-bounds boxes and ignores stale results when detection did not succeed', () => {
  const clipped = lanternflyThumbnailFrame(makeReport([{ x: -10, y: -10, width: 50, height: 50 }]), 144);
  assert.deepEqual(clipped, lanternflyThumbnailFrame(makeReport([{ x: 0, y: 0, width: 40, height: 40 }]), 144));
  const report = makeReport([box]);
  report.identification.status = 'failed';
  assert.equal(lanternflyThumbnailFrame(report, 144), null);
});
