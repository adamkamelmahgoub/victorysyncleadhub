import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHmac} from 'node:crypto';
import {verifyUnipileSignature} from '../lib/social-routes/social-unipile.ts';

test('Unipile signature verifies exact raw body and a fresh timestamp',()=>{
  const now=Date.parse('2026-10-21T12:00:00Z'),timestamp=String(Math.floor(now/1000));
  const raw=Buffer.from('{"type":"message.new", "id":"evt_1"}');
  const signature=createHmac('sha256','test-secret').update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
  const header=`t=${timestamp},v0=${signature}`;
  assert.equal(verifyUnipileSignature(raw,header,'test-secret',now),true);
  assert.equal(verifyUnipileSignature(Buffer.from('{"type":"message.new","id":"evt_1"}'),header,'test-secret',now),false);
  assert.equal(verifyUnipileSignature(raw,header,'wrong-secret',now),false);
  assert.equal(verifyUnipileSignature(raw,header,'test-secret',now+301000),false);
  assert.equal(verifyUnipileSignature(raw,'t=garbage,v0='+signature,'test-secret',now),false);
});
