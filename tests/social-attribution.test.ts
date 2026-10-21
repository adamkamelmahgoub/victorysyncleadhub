import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHmac} from 'node:crypto';
import {verifyAttributionSignature} from '../lib/social-routes/social-attribution.ts';

for(const provider of ['calendly','stripe'] as const)test(`${provider} signature uses exact raw payload and rejects replay`,()=>{
  const now=Date.parse('2026-10-21T12:00:00Z'),timestamp=String(Math.floor(now/1000));
  const raw=Buffer.from('{"event":"invitee.created", "id":"evt_123"}');
  const signature=createHmac('sha256','secret').update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
  const header=`t=${timestamp},v1=${signature}`;
  assert.equal(verifyAttributionSignature(provider,raw,header,'secret',now),true);
  assert.equal(verifyAttributionSignature(provider,Buffer.from('{"event":"invitee.created","id":"evt_123"}'),header,'secret',now),false);
  assert.equal(verifyAttributionSignature(provider,raw,header,'secret',now+301000),false);
  assert.equal(verifyAttributionSignature(provider,raw,header,'wrong',now),false);
});
