import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertNoUnsupportedProof} from '../lib/landing-ai-policy.js';

test('rejects unsupported social proof from structured page content',()=>{
  for(const claim of ['5-star reviews','Licensed and insured','Trusted by thousands','Award winning','Guaranteed results']){
    assert.throws(()=>assertNoUnsupportedProof([{heading:claim}]),/unsupported claims/);
  }
});

test('accepts a page with neutral placeholders',()=>{
  assert.doesNotThrow(()=>assertNoUnsupportedProof([
    {heading:'Schedule a service visit',body:'Tell us what you need and we will contact you.'},
    {heading:'Add customer feedback here',body:'Use a verified customer quote you have permission to publish.'},
  ]));
});
