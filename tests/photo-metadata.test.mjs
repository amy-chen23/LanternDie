import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPhotoMetadata } from '../lib/photo-metadata.ts';

test('reads rational EXIF GPS coordinates and camera local capture time', () => {
  assert.deepEqual(extractPhotoMetadata({
    GPSLatitude: [{ numerator: 37, denominator: 1 }, { numerator: 46, denominator: 1 }, { numerator: 30, denominator: 1 }],
    GPSLatitudeRef: 'N',
    GPSLongitude: ['122/1', '25/1', '10/1'],
    GPSLongitudeRef: 'W',
    DateTimeOriginal: '2025:11:20 10:17:12',
  }), {
    latitude: 37.775,
    longitude: -(122 + 25 / 60 + 10 / 3600),
    source: 'photo_exif',
    photoTakenAtLocal: '2025-11-20T10:17:12',
    deviceLocationCapturedAt: null,
    accuracyMeters: null,
    shareApproximate: false,
  });
});

test('ignores incomplete, malformed, and out-of-range coordinates without losing capture time', () => {
  const result = extractPhotoMetadata({
    GPSLatitude: 91,
    GPSLatitudeRef: 'N',
    GPSLongitude: 'not-a-coordinate',
    GPSLongitudeRef: 'E',
    DateTimeOriginal: '2025:02:30 10:17:12',
    DateTimeDigitized: '2025:02:28 10:17:12',
  });
  assert.equal(result.latitude, null);
  assert.equal(result.longitude, null);
  assert.equal(result.source, null);
  assert.equal(result.photoTakenAtLocal, '2025-02-28T10:17:12');
});

test('supports decimal coordinates, applies hemisphere references, and rejects invalid references', () => {
  const southernWestern = extractPhotoMetadata({
    GPSLatitude: 37.5,
    GPSLatitudeRef: 's',
    GPSLongitude: -122.25,
    GPSLongitudeRef: 'w',
  });
  assert.equal(southernWestern.latitude, -37.5);
  assert.equal(southernWestern.longitude, -122.25);
  assert.equal(southernWestern.source, 'photo_exif');

  const invalidReference = extractPhotoMetadata({
    GPSLatitude: 37.5,
    GPSLatitudeRef: 'N',
    GPSLongitude: 122.25,
    GPSLongitudeRef: 'invalid',
  });
  assert.equal(invalidReference.latitude, null);
  assert.equal(invalidReference.longitude, null);
  assert.equal(invalidReference.source, null);
});

test('returns empty private metadata when the selected image has no EXIF', () => {
  assert.deepEqual(extractPhotoMetadata(null), {
    latitude: null,
    longitude: null,
    source: null,
    photoTakenAtLocal: null,
    deviceLocationCapturedAt: null,
    accuracyMeters: null,
    shareApproximate: false,
  });
});
