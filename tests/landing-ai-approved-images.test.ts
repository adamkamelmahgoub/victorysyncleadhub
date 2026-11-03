import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedAiImageUrls} from '../lib/landing-ai-approved-images.js';
import {assertApprovedAiImages} from '../lib/landing-ai-policy.js';

test('AI image allowlist comes from stored account media and logo',()=>{
  const approved=approvedAiImageUrls({photos:[
    'landing-media/123e4567-e89b-12d3-a456-426614174000/client-photo.webp',
    'https://unapproved.example/photo.jpg','landing-media/../../other-account/photo.jpg'],
    logoUrl:'https://client.example/logo.png'},'https://supabase.example/');
  assert.deepEqual(approved,[
    'https://supabase.example/storage/v1/object/public/landing-media/123e4567-e89b-12d3-a456-426614174000/client-photo.webp',
    'https://client.example/logo.png']);
  assert.throws(()=>assertApprovedAiImages([{imageUrl:'https://unapproved.example/photo.jpg'}],approved),
    /unapproved image/);
});
