import test from 'node:test';
import assert from 'node:assert/strict';
import { nextInlineReview, validReviewBox } from '../lib/community-review.ts';
const row=(insect_id,extra={})=>({insect_id,revision:1,box:{x:0,y:0,width:10,height:10},final_label:null,my_vote:null,can_vote:false,feedback:null,...extra});
test('inline review selects a single unanswered current insect, skipping previous responses and final decisions',()=>{
 const rows=[row('final',{final_label:'dead'}),row('voted',{my_vote:'alive'}),row('unsure',{my_vote:'uncertain'}),row('next'),row('later')];
 assert.equal(nextInlineReview(rows).insect_id,'next');
 rows[3].my_vote='dead';assert.equal(nextInlineReview(rows).insect_id,'later');
 rows[4].my_vote='alive';assert.equal(nextInlineReview(rows),null);
});
test('a review highlight must be inside the actual loaded photo',()=>{
 assert.equal(validReviewBox({x:5,y:3,width:10,height:8},20,20),true);
 for(const box of [{x:-1,y:0,width:1,height:1},{x:0,y:0,width:21,height:1},{x:0,y:0,width:0,height:1},{x:NaN,y:0,width:1,height:1}])assert.equal(validReviewBox(box,20,20),false);
 assert.equal(validReviewBox({x:0,y:0,width:1,height:1},0,20),false);
});
