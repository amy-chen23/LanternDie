import test from 'node:test';
import assert from 'node:assert/strict';
import { photoCheckResult } from '../lib/photo-check-result.ts';

const noDetection = {
  workflow_status: 'admin_review', identification: { status: 'not_detected' },
  processing: { status: 'complete' }, insects_ready: false, insects: [],
};

test('completed no-detection results explain pending admin review without declaring rejection', () => {
  const result = photoCheckResult(noDetection);
  assert.equal(result.title, 'No lanternfly detected');
  assert.match(result.explanation, /may have been missed/);
  assert.match(result.nextSteps, /Pending review/);
  assert.match(result.nextSteps, /admin/);
  assert.doesNotMatch(result.nextSteps, /rejected|will not be published/);
});

test('rejected no-detection results explain publication and next steps', () => {
  const result = photoCheckResult({ ...noDetection, workflow_status: 'rejected' });
  assert.match(result.nextSteps, /will not be published/);
  assert.match(result.nextSteps, /no kill credit/);
  assert.match(result.nextSteps, /clearer photo/);
  assert.doesNotMatch(result.nextSteps, /Pending review/);
});

test('incomplete or failed checks never claim that no lanternfly was detected', () => {
  for (const status of ['processing', 'failed', 'detected']) {
    assert.equal(photoCheckResult({ ...noDetection, identification: { status } }), null);
  }
  assert.equal(photoCheckResult({ ...noDetection, identification: null }), null);
  for (const status of ['queued', 'running', 'retry', 'failed']) {
    assert.equal(photoCheckResult({ ...noDetection, processing: { status } }), null);
  }
});

test('admin-corrected insects supersede the original empty detection result', () => {
  assert.equal(photoCheckResult({ ...noDetection, insects_ready: true, insects: [{ id: 'insect' }] }), null);
  assert.equal(photoCheckResult({ ...noDetection, insects: [{ id: 'insect' }] }), null);
  assert.equal(photoCheckResult({ ...noDetection, insects_ready: true }), null);
});

test('duplicates explain why publication is blocked without inventing a detection result', () => {
  const result = photoCheckResult({ ...noDetection, workflow_status: 'rejected', identification: null, processing: { status: 'duplicate' } });
  assert.equal(result.title, 'Duplicate photo');
  assert.match(result.nextSteps, /will not be published/);
  assert.doesNotMatch(result.title, /No lanternfly/);
});

test('a published report never incorrectly claims it is pending or rejected', () => {
  const result = photoCheckResult({ ...noDetection, workflow_status: 'published' });
  assert.match(result.nextSteps, /published following review/);
  assert.doesNotMatch(result.nextSteps, /Pending review|was rejected|will not be published/);
});
