import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSubmissionFilter, submissionStatusLabel } from '../lib/submission-filters.ts';

const statuses = ['pending_detection', 'pending_review', 'admin_review', 'published', 'rejected'];

test('all submissions remain visible regardless of processing or review outcome', () => {
  for (const status of statuses) assert.equal(matchesSubmissionFilter(status, 'all'), true);
});

test('pending includes processing and both review stages, excluding final outcomes', () => {
  assert.deepEqual(statuses.filter(status => matchesSubmissionFilter(status, 'pending')),
    ['pending_detection', 'pending_review', 'admin_review']);
});

test('published and rejected remain separate from each other and pending submissions', () => {
  assert.deepEqual(statuses.filter(status => matchesSubmissionFilter(status, 'published')), ['published']);
  assert.deepEqual(statuses.filter(status => matchesSubmissionFilter(status, 'rejected')), ['rejected']);
});

test('every workflow state belongs to exactly one status filter and has a matching label', () => {
  for (const status of statuses) {
    const matches = ['pending', 'published', 'rejected'].filter(filter => matchesSubmissionFilter(status, filter));
    assert.equal(matches.length, 1);
    assert.equal(submissionStatusLabel(status).toLowerCase(), matches[0]);
  }
});
