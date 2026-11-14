import test from 'node:test';
import assert from 'node:assert/strict';
import policy from '../assets/models/policy.json' with { type: 'json' };
import { assessmentComplete, currentAssessment, shouldAutoAssess } from '../lib/classification-label.ts';
const report = () => ({workflow_status:'pending_review',processing:{status:'complete'},
 identification:{status:'detected',updated_at:'current',detections:[{x:0,y:0,width:10,height:10}]},
 death_assessment:{model_sha256:policy.modelSha256,detector_updated_at:'current',status:'complete',scores:[0.99],threshold:policy.threshold}});
test('only complete matching model/snapshot/threshold and valid per-crop scores suppress inference',()=>{
 assert.equal(assessmentComplete(report()),true);
 for(const mutate of [r=>r.death_assessment.model_sha256='old',r=>r.death_assessment.detector_updated_at='old',r=>r.death_assessment.threshold=0.7,
  r=>r.death_assessment.scores=[],r=>r.death_assessment.scores=[NaN],r=>r.death_assessment.scores=[1.1],r=>r.identification.status='not_detected']) {
  const r=report();mutate(r);assert.equal(assessmentComplete(r),false);
 }
});
test('failed current observations need explicit retry; new snapshots and capable devices may resume',()=>{
 const r=report();r.death_assessment.status='failed';assert.equal(shouldAutoAssess(r,true),false);
 r.death_assessment.detector_updated_at='old';assert.equal(currentAssessment(r),null);assert.equal(shouldAutoAssess(r,true),true);
 r.death_assessment.detector_updated_at='current';r.death_assessment.status='unavailable';assert.equal(shouldAutoAssess(r,true),true);assert.equal(shouldAutoAssess(r,false),false);
});
test('rejected/duplicate/undetected reports never schedule model work',()=>{
 for(const mutate of [r=>r.workflow_status='rejected',r=>r.processing.status='duplicate',r=>r.identification.status='processing',r=>r.identification.detections=[]]) {
  const r=report();r.death_assessment=null;mutate(r);assert.equal(shouldAutoAssess(r,true),false);
 }
});
