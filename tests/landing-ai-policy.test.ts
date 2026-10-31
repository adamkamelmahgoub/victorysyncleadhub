import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertNoUnsupportedProof,assertApprovedAiImages} from '../lib/landing-ai-policy.js';

test('rejects unsupported social proof from structured page content',()=>{
  for(const claim of ['5-star reviews','Licensed and insured','Trusted by thousands','Award winning','Guaranteed results',
    '25 years serving homeowners','Serving since 1998','Repairs from $99','Bonded technicians','4.9/5 rating','1,200 happy customers']){
    assert.throws(()=>assertNoUnsupportedProof([{heading:claim}]),/unsupported claims/);
  }
});

test('accepts a page with neutral placeholders',()=>{
  assert.doesNotThrow(()=>assertNoUnsupportedProof([
    {heading:'Schedule a service visit',body:'Tell us what you need and we will contact you.'},
    {heading:'Add customer feedback here',body:'Use a verified customer quote you have permission to publish.'},
    {heading:'[Add a real customer review]',body:'[Insert approved review from this client]',buttonText:'Request a quote'},
  ]));
});

test('checks page titles, SEO copy and buttons through the same policy',()=>{
  assert.throws(()=>assertNoUnsupportedProof([{heading:'Plumbing from $49'}]),/unsupported claims/);
  assert.throws(()=>assertNoUnsupportedProof([{body:'Licensed plumbers in your area'}]),/unsupported claims/);
  assert.throws(()=>assertNoUnsupportedProof([{buttonText:'Get a guaranteed result'}]),/unsupported claims/);
});

test('rejects proof sections and images that were not supplied by the client',()=>{
  for(const type of ['reviews','testimonial','trust_bar'])
    assert.throws(()=>assertNoUnsupportedProof([{type,heading:'Customer feedback'}]),/unsupported proof sections/);
  assert.throws(()=>assertApprovedAiImages([{imageUrl:'https://example.com/invented.jpg'}],[]),/unapproved image/);
  assert.doesNotThrow(()=>assertApprovedAiImages([{imageUrl:'https://example.com/approved.jpg'}],['https://example.com/approved.jpg']));
});
