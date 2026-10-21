import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignStatusAction} from '../artifacts/leadgen/src/lib/dm-campaign-action.js';

const id='12345678-1234-1234-1234-123456789abc';
test('Activate and Pause send a valid campaign identifier',()=>{
  assert.deepEqual(campaignStatusAction(id,'draft'),{action:'status',campaign_id:id,status:'active'});
  assert.deepEqual(campaignStatusAction(id,'active'),{action:'status',campaign_id:id,status:'paused'});
});
test('stale campaign cards do not send a malformed request',()=>{
  assert.throws(()=>campaignStatusAction('', 'draft'),/Refresh/);
});
