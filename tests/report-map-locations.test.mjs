import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommunityMapLocations } from '../lib/community-map-locations.ts';

test('converts Supabase numeric coordinates into validated map points', () => {
  assert.deepEqual(parseCommunityMapLocations([
    { latitude: '37.78', longitude: -122.41 },
  ]), [{ latitude: 37.78, longitude: -122.41 }]);
});

test('returns no points for an empty community map', () => {
  assert.deepEqual(parseCommunityMapLocations([]), []);
});

test('rejects malformed or out-of-range map points', () => {
  assert.throws(() => parseCommunityMapLocations(null), /could not be read/);
  assert.throws(() => parseCommunityMapLocations([{ latitude: 91, longitude: 0 }]), /Invalid latitude/);
  assert.throws(() => parseCommunityMapLocations([{ latitude: 0, longitude: 'NaN' }]), /Invalid longitude/);
});
