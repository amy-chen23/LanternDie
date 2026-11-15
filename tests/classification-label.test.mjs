import assert from 'node:assert/strict';
import test from 'node:test';
import policy from '../assets/models/policy.json' with { type: 'json' };
import { classificationLabel, classificationForBox, summarizeClassifications, reportClassificationSummary } from '../lib/classification-label.ts';

test('results use only the four labels, with final labels taking precedence', () => {
  assert.equal(classificationLabel('alive',0.999,0.98),'ALIVE');
  assert.equal(classificationLabel('dead',0.01,0.98),'DEAD');
  assert.equal(classificationLabel('pending',0.98,0.98),'LIKELY DEAD');
  assert.equal(classificationLabel(null,0.98-Number.EPSILON,0.98),'UNCERTAIN');
  for (const score of [undefined,NaN,Infinity,-1,1.01,0.01]) assert.equal(classificationLabel(null,score,0.98),'UNCERTAIN');
});
test('old detector snapshots and corrected boxes cannot inherit a model label', () => {
  const box = {x:1,y:2,width:3,height:4};
  const report = {identification:{status:'detected',updated_at:'current',detections:[box]},death_assessment:{model_sha256:policy.modelSha256,status:'complete',detector_updated_at:'current',scores:[0.99],threshold:0.98}};
  assert.equal(classificationForBox(report,box),'LIKELY DEAD');
  assert.equal(classificationForBox(report,{...box,x:2}),'UNCERTAIN');
  assert.equal(classificationForBox(report,box,'alive'),'ALIVE');
  report.death_assessment.detector_updated_at = 'old';
  assert.equal(classificationForBox(report,box),'UNCERTAIN');
  assert.equal(classificationForBox(report,box,'dead'),'DEAD');
});

test('detection summaries group classifications with singular and plural counts', () => {
  assert.equal(summarizeClassifications(['UNCERTAIN']), '1 UNCERTAIN lanternfly detected');
  assert.equal(summarizeClassifications(['ALIVE','UNCERTAIN']), '1 ALIVE lanternfly and 1 UNCERTAIN lanternfly detected');
  assert.equal(summarizeClassifications(['DEAD','DEAD']), '2 DEAD lanternflies detected');
  assert.equal(summarizeClassifications(['ALIVE','UNCERTAIN','UNCERTAIN']), '1 ALIVE lanternfly and 2 UNCERTAIN lanternflies detected');
  assert.equal(summarizeClassifications(['ALIVE','DEAD','ALIVE','LIKELY DEAD']), '2 ALIVE lanternflies, 1 DEAD lanternfly and 1 LIKELY DEAD lanternfly detected');
  assert.equal(summarizeClassifications([]), 'No lanternfly detected');
});
test('report summary combines final labels and pending classifications without double-counting detector boxes', () => {
  const box = {x:1,y:2,width:3,height:4};
  const second = {...box,x:5};
  const report = {insects_ready:true,insects:[{box,label:'alive'},{box:second,label:'pending'}],
    identification:{status:'detected',updated_at:'current',detections:[box,second]},
    death_assessment:{model_sha256:policy.modelSha256,status:'complete',detector_updated_at:'current',scores:[0.99,0.1],threshold:0.98}};
  assert.equal(reportClassificationSummary(report),'1 ALIVE lanternfly and 1 UNCERTAIN lanternfly detected');
  report.insects_ready=false;
  report.insects=[];
  assert.equal(reportClassificationSummary(report),'1 LIKELY DEAD lanternfly and 1 UNCERTAIN lanternfly detected');
});
