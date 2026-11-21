import test from 'node:test';
import assert from 'node:assert/strict';
import { approximateCoordinates } from '../lib/approximate-location.ts';

test('rounds coordinates to two decimal places before they can be stored or shared', () => {
  assert.deepEqual(approximateCoordinates(37.5017, -122.254), {
    latitude: 37.5,
    longitude: -122.25,
  });
});

test('preserves valid boundary coordinates and normalizes rounded negative zero', () => {
  assert.deepEqual(approximateCoordinates(90, -0.001), {
    latitude: 90,
    longitude: 0,
  });
});

test('rejects invalid coordinates instead of creating a misleading pin', () => {
  assert.throws(() => approximateCoordinates(Number.NaN, 0), /Latitude must be between/);
  assert.throws(() => approximateCoordinates(0, 181), /Longitude must be between/);
});
