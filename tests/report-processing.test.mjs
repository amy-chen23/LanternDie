import test from 'node:test';
import assert from 'node:assert/strict';
import { reportProcessingMessage, hasPendingProcessing } from '../lib/report-processing.ts';

test('duplicate and rejected reports never display a pending approval message', () => {
  assert.match(reportProcessingMessage('rejected', { status: 'duplicate' }), /duplicate/i);
  assert.match(reportProcessingMessage('rejected', { status: 'complete' }), /rejected/i);
});
test('technical retries and manual review have different in-app statuses', () => {
  assert.match(reportProcessingMessage('pending_detection', { status: 'retry' }), /automatically/i);
  assert.match(reportProcessingMessage('admin_review', { status: 'complete' }), /admin/i);
  assert.match(reportProcessingMessage('pending_review', { status: 'complete' }), /every insect/i);
  assert.match(reportProcessingMessage('published', { status: 'complete' }), /published/i);
});
test('poll only while durable background work remains', () => {
  assert.equal(hasPendingProcessing([null, { status: 'retry' }]), true);
  assert.equal(hasPendingProcessing([{ status: 'running' }]), true);
  assert.equal(hasPendingProcessing([{ status: 'complete' }, { status: 'failed' }, { status: 'duplicate' }]), false);
});
