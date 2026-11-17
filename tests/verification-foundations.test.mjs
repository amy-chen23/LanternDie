import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { verificationStates, transitions, canTransition, defaultVerificationPolicy, classifyRawScore, bandsConfigured } from '../lib/verification-state.ts';
import { createShadowVerificationService } from '../lib/verification-service.ts';

test('policy defaults preserve current panel size, quorum and 24-hour window, without invented acceptance bands', () => {
  assert.equal(defaultVerificationPolicy.reviewSeats,5);
  assert.equal(defaultVerificationPolicy.matchingVotes,3);
  assert.equal(defaultVerificationPolicy.reviewWindowSeconds,86400);
  assert.equal(defaultVerificationPolicy.autoAcceptanceEnabled,false);
  assert.equal(defaultVerificationPolicy.calibrationApproved,false);
  for(const score of [0,0.01,0.5,0.98,1]) {
    assert.deepEqual(classifyRawScore(score,defaultVerificationPolicy,true),{band:'UNCONFIGURED',predictedLifeStatus:null,autoAcceptEligible:false});
  }
});
test('transition graph rejects skipped acceptance, repeated states, unknown states and direct reopening of final labels', () => {
  assert.equal(verificationStates.length,8);
  assert.equal(canTransition('PENDING','VERIFIED'),false);
  assert.equal(canTransition('AI_CLASSIFIED','PROVISIONAL'),true);
  assert.equal(canTransition('VERIFIED','CONTESTED'),true);
  assert.equal(canTransition('VERIFIED','PROVISIONAL'),false);
  assert.equal(canTransition('__proto__','VERIFIED'),false);
  for(const state of verificationStates) assert.equal(canTransition(state,state),false);
});
test('TypeScript and authoritative SQL transition definitions stay aligned', () => {
  const sql=readFileSync(new URL('../supabase/migrations/20261118000000_verification_foundations.sql',import.meta.url),'utf8');
  for(const [from,allowed] of Object.entries(transitions)) {
    const match=sql.match(new RegExp(`when '${from}' then array\\[([^\\]]+)\\]`));
    assert.ok(match,from);
    assert.deepEqual([...match[1].matchAll(/'([^']+)'/g)].map(x=>x[1]),allowed);
  }
});
test('approved TEST-ONLY bands have explicit boundaries and never promote browser evidence', () => {
  // These numbers are fixtures only; the production/default policy has null bands.
  const policy={...defaultVerificationPolicy,highAliveMax:0.01,mediumAliveMax:0.2,mediumDeadMin:0.8,highDeadMin:0.99,calibrationApproved:true,autoAcceptanceEnabled:true};
  for(const [score,band,label] of [[0.01,'HIGH','ALIVE'],[0.2,'MEDIUM','ALIVE'],[0.5,'LOW',null],[0.8,'MEDIUM','DEAD'],[0.99,'HIGH','DEAD']]) {
    const trusted=classifyRawScore(score,policy,true),untrusted=classifyRawScore(score,policy,false);
    assert.equal(trusted.band,band);assert.equal(trusted.predictedLifeStatus,label);
    assert.equal(trusted.autoAcceptEligible,band==='HIGH');assert.equal(untrusted.autoAcceptEligible,false);
  }
  assert.equal(bandsConfigured({...policy,highAliveMax:NaN}),false);
  assert.equal(bandsConfigured({...policy,mediumAliveMax:0.9}),false);
  for(const score of [NaN,Infinity,-0.1,1.1]) assert.throws(()=>classifyRawScore(score,policy,true),/invalid_raw_score/);
});
test('shadow service forwards optimistic versions and idempotency keys, without updating live tables',async () => {
  const calls=[];
  const service=createShadowVerificationService({rpc:async(name,args)=>{calls.push({name,args});return{data:'decision-id',error:null};}});
  await service.transition({insectId:'insect',revision:2,expectedVersion:3,to:'COMMUNITY_REVIEW',acceptedLifeStatus:null,method:'admin',policyId:'policy',predictionId:null,reason:'test',idempotencyKey:'event'});
  assert.equal(calls[0].name,'transition_shadow_verification');assert.equal(calls[0].args.p_expected_version,3);assert.equal(calls[0].args.p_key,'event');
  await service.recordCredit({insectId:'insect',decisionId:'decision',to:'HELD',idempotencyKey:'credit-event',reason:'test'});
  assert.equal(calls[1].name,'record_shadow_credit_event');
  const failed=createShadowVerificationService({rpc:async()=>({data:null,error:{message:'Decision version changed'}})});
  await assert.rejects(failed.recordCredit({insectId:'i',decisionId:'d',to:'PROVISIONAL',idempotencyKey:'key',reason:'test'}),/Decision version changed/);
});
