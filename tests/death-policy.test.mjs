import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { paddedCrop, prepareCrop, proposedRoute } from '../lib/death-policy.ts';

test('crop padding matches training rounding and clamps at image boundaries', () => {
  assert.deepEqual(paddedCrop({ x: 10, y: 20, width: 100, height: 50 }, 120, 100), { x: 0, y: 12, width: 120, height: 66 });
  assert.throws(() => paddedCrop({ x: 10, y: 20, width: NaN, height: 50 }, 120, 100));
});

test('shadow routing requires community review even above the cutoff', () => {
  assert.equal(proposedRoute([0.999], 0.98), 'community_verification');
  assert.equal(proposedRoute([0.98, 0.99], 0.98, true), 'likely_dead');
  for (const scores of [[], [NaN], [1.1], [0.99, 0.97]]) assert.equal(proposedRoute(scores, 0.98, true), 'community_verification');
});

// Golden digests generated with Pillow ImageOps.pad(BILINEAR) from deterministic
// synthetic pixels: cover up/downsampling, identity, odd padding, and narrow crops.
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/death-preprocessing.json', import.meta.url)));
for (const fixture of fixtures) test(`preprocessing matches Pillow for ${fixture.width}x${fixture.height}`, () => {
  const { width, height, crop } = fixture;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    rgba.set([(x * 17 + y * 13) % 256, (x * 3 + y * 29) % 256, (x * 41 + y * 7) % 256, 255], (y * width + x) * 4);
  }
  const prepared = prepareCrop(rgba, width, height, crop);
  const checksum = createHash('sha256').update(Uint8Array.from(prepared)).digest('hex');
  assert.equal(checksum, fixture.sha256);
});

test('bundled model, policy, and server registry use the same checksum', () => {
  const model = readFileSync(new URL('../assets/models/lanternfly-dead.onnx', import.meta.url));
  const metadata = JSON.parse(readFileSync(new URL('../assets/models/model.json', import.meta.url)));
  const policy = JSON.parse(readFileSync(new URL('../assets/models/policy.json', import.meta.url)));
  const checksum = createHash('sha256').update(model).digest('hex');
  assert.equal(metadata.sha256, checksum);
  assert.equal(policy.modelSha256, checksum);
  assert.equal(metadata.input.dtype, 'float32');
  assert.equal(policy.automaticVerificationEnabled, false);
  const migration = readFileSync(new URL('../supabase/migrations/20261107000000_death_assessments.sql', import.meta.url), 'utf8');
  assert.ok(migration.includes(checksum));
});
