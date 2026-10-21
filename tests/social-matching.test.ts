import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseSocialMatch,trigramSimilarity} from '../lib/social-matching.js';

const base={organizationId:'org',repUserId:'rep-a',platform:'instagram' as const,providerUserId:'provider-1'};
const owned={lead_id:'lead-a',owner_rep_id:'rep-a',normalized_handle:'victorysmith',profile_url:'https://www.instagram.com/victorysmith',
  first_name:'Victory',last_name:'Smith',company:'Victory Sync'};
test('matching uses an owned exact handle before fuzzy names',()=>{
  const match=chooseSocialMatch([owned],{...base,publicIdentifier:'@victorysmith',displayName:'Someone Else'});
  assert.deepEqual(match,{leadId:'lead-a',status:'matched',confidence:.95,method:'handle'});
});
test('a name match is only a suggestion and never links another rep lead',()=>{
  assert.equal(chooseSocialMatch([owned],{...base,displayName:'Victory Smith'}).status,'suggested');
  assert.equal(chooseSocialMatch([{...owned,owner_rep_id:'rep-b'}],{...base,publicIdentifier:'victorysmith'}).status,'unmatched');
});
test('unrelated names remain unmatched',()=>{
  assert.ok(trigramSimilarity('Mary Adams','Victory Smith')<.6);
  assert.equal(chooseSocialMatch([owned],{...base,displayName:'Mary Adams'}).status,'unmatched');
});
