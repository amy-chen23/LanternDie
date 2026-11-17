import assert from 'node:assert/strict';
import test from 'node:test';
import { reportDetectionSummary } from '../lib/detection-summary.ts';

const box = { x: 0, y: 0, width: 10, height: 10 };
const report = () => ({ insects_ready: false, insects: [], identification: { status: 'detected', detections: [box] } });
test('detector results describe only the number of lanternflies', () => {
  const r = report();
  assert.equal(reportDetectionSummary(r), '1 lanternfly detected');
  r.identification.detections.push(box);
  assert.equal(reportDetectionSummary(r), '2 lanternflies detected');
  r.identification.status = 'not_detected';
  assert.equal(reportDetectionSummary(r), 'No lanternfly detected');
  assert.equal(reportDetectionSummary({ insects_ready: false, insects: [], identification: null }), 'No lanternfly detected');
});
test('active human-corrected boxes determine the count, without classifying life status', () => {
  const r = report(); r.insects_ready = true;
  r.insects = [{ box, label: 'alive' }, { box, label: 'dead' }, { box, label: 'pending' }];
  assert.equal(reportDetectionSummary(r), '3 lanternflies detected');
  r.insects = [];
  assert.equal(reportDetectionSummary(r), 'No lanternfly detected');
});
test('historical classifier scores never affect detection summaries', () => {
  const r = report();
  r.death_assessment = { status: 'complete', scores: [1], threshold: 0.98 };
  assert.equal(reportDetectionSummary(r), '1 lanternfly detected');
});
