import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSubmissionFilter, submissionStatusLabel } from '../lib/submission-filters.ts';
const report = (workflow_status, verified_kills = 0) => ({workflow_status, verified_kills});
const statuses = ['pending_detection', 'pending_review', 'admin_review', 'published', 'rejected'];

test('all submissions stay visible and pending includes only processing/review stages', () => {
  for (const status of statuses) assert.equal(matchesSubmissionFilter(report(status), 'all'), true);
  assert.deepEqual(statuses.filter(status => matchesSubmissionFilter(report(status), 'pending')), ['pending_detection', 'pending_review', 'admin_review']);
});
test('earned points requires published server credits; published alive-only sightings have no points', () => {
  assert.equal(matchesSubmissionFilter(report('published', 1), 'earned'), true);
  assert.equal(matchesSubmissionFilter(report('published', 3), 'earned'), true);
  assert.equal(matchesSubmissionFilter(report('published', 0), 'earned'), false);
  assert.equal(matchesSubmissionFilter(report('published', 0), 'no_points'), true);
  assert.equal(matchesSubmissionFilter(report('rejected', 0), 'no_points'), true);
  for (const status of ['pending_detection', 'pending_review', 'admin_review', 'rejected']) assert.equal(matchesSubmissionFilter(report(status, 1), 'earned'), false);
});
test('four published sightings with two DEAD and two ALIVE yield two earned sightings and two points', () => {
  const sightings = [report('published', 1), report('published', 1), report('published'), report('published')];
  const earned = sightings.filter(r => matchesSubmissionFilter(r, 'earned'));
  assert.equal(earned.length, 2); assert.equal(earned.reduce((sum, r) => sum + r.verified_kills, 0), 2);
  assert.equal(sightings.filter(r => matchesSubmissionFilter(r, 'no_points')).length, 2);
});
test('multiple DEAD insects earn multiple points in one sighting; invalid credit values never claim points', () => {
  const sightings = [report('published', 3), report('published', 1)];
  assert.equal(sightings.filter(r => matchesSubmissionFilter(r, 'earned')).length, 2);
  assert.equal(sightings.reduce((sum,r) => sum+r.verified_kills,0), 4);
  for (const value of [undefined, NaN, Infinity, -1, 0.5]) assert.equal(matchesSubmissionFilter({...report('published'),verified_kills:value}, 'earned'), false);
});
test('valid reports belong to exactly one category while workflow labels remain unchanged', () => {
  for (const r of [...statuses.map(s => report(s)), report('published', 2)]) {
    assert.equal(['pending','earned','no_points'].filter(filter => matchesSubmissionFilter(r, filter)).length, 1);
  }
  assert.equal(submissionStatusLabel('published'), 'Published');
  assert.equal(submissionStatusLabel('rejected'), 'Rejected');
});
