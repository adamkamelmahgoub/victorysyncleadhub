import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newFormSlug} from '../lib/form-slug.js';

test('new forms and pages get distinct URL-safe slugs',()=>{
  const first=newFormSlug('A/C Repair');
  const second=newFormSlug('A/C Repair');
  assert.match(first,/^a-c-repair-[0-9a-f]{8}$/);
  assert.notEqual(first,second);
  assert.match(newFormSlug('!'),/^form-[0-9a-f]{8}$/);
});
