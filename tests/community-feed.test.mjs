import assert from 'node:assert/strict';
import test from 'node:test';
import { communityApproval, communityFeedStatuses, communityTone } from '../lib/community-feed.ts';

test('feed includes uploads before detection, review, and approval while excluding rejected posts', () => {
  assert.deepEqual(communityFeedStatuses,['pending_detection','pending_review','admin_review','published']);
  assert.equal(communityFeedStatuses.includes('rejected'),false);
});
test('only finalized reports display approved; corrections restore the pending indicator', () => {
  const approved={workflow_status:'published',insects_ready:true,insects:[{label:'dead'},{label:'alive'}]};
  assert.equal(communityApproval(approved),'approved');
  for (const workflow_status of ['pending_detection','pending_review','admin_review']) {
    assert.equal(communityApproval({...approved,workflow_status}),'pending');
  }
  assert.equal(communityApproval({...approved,insects:[{label:'dead'},{label:'pending'}]}),'pending');
  assert.equal(communityApproval({...approved,insects:[]}),'pending');
  assert.equal(communityApproval({...approved,insects_ready:false}),'pending');
});

test('card colors reflect confirmed insects while rejection always wins', () => {
  const report = {workflow_status:'published',insects:[{label:'dead'}]};
  assert.equal(communityTone(report),'dead');
  assert.equal(communityTone({...report,insects:[{label:'alive'}]}),'neutral');
  assert.equal(communityTone({...report,insects:[{label:'pending'}],death_assessment:{scores:[1]}}),'neutral');
  assert.equal(communityTone({...report,insects:[]}),'neutral');
  assert.equal(communityTone({...report,insects:[{label:'alive'},{label:'dead'},{label:'pending'}]}),'dead');
  assert.equal(communityTone({...report,workflow_status:'rejected'}),'rejected');
  assert.equal(communityApproval({...report,workflow_status:'rejected',insects_ready:true}),'rejected');
});
