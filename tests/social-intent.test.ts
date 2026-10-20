import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explicitIntent } from '../lib/social-intent.ts';
test('clear opt-outs are recognized without model availability',()=>{
  assert.equal(explicitIntent('Please remove me from this list'),'unsubscribe');
  assert.equal(explicitIntent('I am not interested'),'not_interested');
  assert.equal(explicitIntent('Maybe next month'),null);
});
