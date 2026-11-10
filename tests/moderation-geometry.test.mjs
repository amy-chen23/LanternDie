import test from 'node:test';
import assert from 'node:assert/strict';
import { imagePoint, dragBox, validBox } from '../lib/moderation-geometry.ts';

test('scaled photo gestures map to saved-image coordinates and clamp outside drags', () => {
  assert.deepEqual(imagePoint({ x: 100, y: 50 }, 200, 100, 1600, 800), { x: 800, y: 400 });
  assert.deepEqual(imagePoint({ x: -10, y: 200 }, 200, 100, 1600, 800), { x: 0, y: 800 });
  assert.throws(() => imagePoint({ x: 0, y: 0 }, 0, 100, 1600, 800));
});
test('drawing in either direction produces a valid box, including boundary taps', () => {
  const forward = dragBox('draw', { x: 10, y: 20 }, { x: 90, y: 70 }, null, 100, 80);
  assert.deepEqual(dragBox('draw', { x: 90, y: 70 }, { x: 10, y: 20 }, null, 100, 80), forward);
  assert.deepEqual(dragBox('draw', { x: 100, y: 80 }, { x: 0, y: 0 }, null, 100, 80), { x: 0, y: 0, width: 100, height: 80 });
  assert.ok(validBox(dragBox('draw', { x: 100, y: 80 }, { x: 100, y: 80 }, null, 100, 80), 100, 80));
});
test('moving preserves size and stays inside all four photo edges', () => {
  const box = { x: 10, y: 20, width: 30, height: 40 };
  assert.deepEqual(dragBox('move', { x: 0, y: 0 }, { x: 1000, y: -1000 }, box, 100, 80), { x: 70, y: 0, width: 30, height: 40 });
});
test('resizing preserves top-left and prevents inverted or overflowing boxes', () => {
  const box = { x: 10, y: 20, width: 30, height: 40 };
  assert.deepEqual(dragBox('resize', { x: 0, y: 0 }, { x: 1000, y: -1000 }, box, 100, 80), { x: 10, y: 20, width: 90, height: 1 });
  assert.throws(() => dragBox('resize', { x: 0, y: 0 }, { x: 1, y: 1 }, null, 100, 80));
});
test('typed coordinates reject missing, nonfinite, negative, empty, and off-image geometry', () => {
  for (const box of [null, { x: -1, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: NaN, height: 1 },
    { x: 0, y: 0, width: 0, height: 1 }, { x: 99, y: 0, width: 2, height: 1 }]) {
    assert.equal(validBox(box, 100, 80), false);
  }
});
