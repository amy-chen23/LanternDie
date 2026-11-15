import assert from 'node:assert/strict';
import test from 'node:test';
import { publicationUpdates, parsePublicationLedger } from '../lib/publication-celebration.ts';
const report = {id:'one',user_id:'owner',visibility:'public',workflow_status:'pending_review',verified_kills:0};

test('historical published sightings are seeded without celebratory popups', () => {
  const initial=publicationUpdates(null,[{...report,workflow_status:'published',verified_kills:1}],'owner');
  assert.deepEqual(initial.celebrations,[]);
  assert.deepEqual(initial.ledger,{one:true});
});
test('confirmed dead publication celebrates once and survives persisted reloads', () => {
  const initial=publicationUpdates(null,[report],'owner');
  const published={...report,workflow_status:'published',verified_kills:2};
  const next=publicationUpdates(initial.ledger,[published],'owner');
  assert.deepEqual(next.celebrations,[{reportId:'one',deadCount:2}]);
  const reloaded=publicationUpdates(parsePublicationLedger(JSON.stringify(next.ledger)),[published],'owner');
  assert.deepEqual(reloaded.celebrations,[]);
  assert.equal(reloaded.changed,false);
  assert.deepEqual(publicationUpdates(next.ledger,[report,published],'owner').celebrations,[]);
});
test('alive, private, pending, and other users reports cannot trigger a dead-publication popup', () => {
  for(const overrides of [{workflow_status:'published'}, {verified_kills:1},
    {workflow_status:'published',verified_kills:1,visibility:'private'},
    {workflow_status:'published',verified_kills:1,user_id:'other'},
    {workflow_status:'published',verified_kills:NaN}]) {
    assert.deepEqual(publicationUpdates({},[{...report,...overrides}],'owner').celebrations,[]);
  }
});
test('newly observed publications and delayed committed credit are handled', () => {
  const published={...report,workflow_status:'published',verified_kills:1};
  assert.equal(publicationUpdates({},[published],'owner').celebrations.length,1);
  const waiting=publicationUpdates({},[{...published,verified_kills:0}],'owner');
  assert.equal(publicationUpdates(waiting.ledger,[published],'owner').celebrations.length,1);
});
test('invalid stored state is ignored safely', () => {
  for(const value of [null,'','bad','null','[]','{"one":"true"}']) assert.equal(parsePublicationLedger(value),null);
  assert.deepEqual(parsePublicationLedger('{"one":true,"two":false}'),{one:true,two:false});
});
