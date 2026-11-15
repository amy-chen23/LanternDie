import assert from 'node:assert/strict';
import test from 'node:test';
import { voteDistribution } from '../lib/community-votes.ts';

test('vote percentages include uncertain responses and round to whole numbers', () => {
  const result = voteDistribution({alive_votes:1,dead_votes:3,uncertain_votes:2});
  assert.equal(result.total, 6);
  assert.deepEqual(result.options, [
    {label:'alive',count:1,percent:17}, {label:'dead',count:3,percent:50}, {label:'uncertain',count:2,percent:33},
  ]);
});
test('restricted results remain distinct from approved insects with no votes', () => {
  assert.equal(voteDistribution({alive_votes:null,dead_votes:null,uncertain_votes:null}), null);
  assert.equal(voteDistribution({alive_votes:0,dead_votes:null,uncertain_votes:0}), null);
  const empty = voteDistribution({alive_votes:0,dead_votes:0,uncertain_votes:0});
  assert.equal(empty.total,0);
  assert.ok(empty.options.every(option => option.percent === 0));
});
test('invalid counts never produce misleading percentages', () => {
  for (const alive_votes of [-1,0.5,NaN,Infinity]) {
    assert.equal(voteDistribution({alive_votes,dead_votes:1,uncertain_votes:0}),null);
  }
});
