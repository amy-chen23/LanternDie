import assert from 'node:assert/strict';
import test from 'node:test';
import { communityApproval, communityFeedStatuses, confirmedInsectCounts } from '../lib/community-feed.ts';

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

test('confirmed result tags count alive and dead insects only after approval', () => {
  const report = {workflow_status:'published',insects_ready:true,insects:[{label:'dead'}]};
  assert.deepEqual(confirmedInsectCounts(report), {alive:0,dead:1});
  assert.deepEqual(confirmedInsectCounts({...report,insects:[{label:'alive'}]}), {alive:1,dead:0});
  assert.deepEqual(confirmedInsectCounts({...report,insects:[{label:'alive'},{label:'dead'},{label:'alive'}]}), {alive:2,dead:1});
  for (const workflow_status of ['pending_review','pending_detection','admin_review','rejected']) {
    assert.equal(confirmedInsectCounts({...report,workflow_status}), null);
  }
  assert.equal(confirmedInsectCounts({...report,insects:[{label:'dead'},{label:'pending'}]}), null);
  assert.equal(confirmedInsectCounts({...report,insects:[]}), null);
  assert.equal(confirmedInsectCounts({...report,insects_ready:false}), null);
});
