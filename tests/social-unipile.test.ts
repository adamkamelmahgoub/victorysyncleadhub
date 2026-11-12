import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHmac} from 'node:crypto';
import {verifyUnipileSignature} from '../lib/social-routes/social-unipile.ts';
import {unipileChatQuery,nextUnipileHistoryCursor} from '../lib/social-unipile-client.ts';

test('recent Unipile polling always starts at the newest chats while history advances separately',()=>{
  const recent=unipileChatQuery('v2','acc_demo','recent','old-cursor');
  assert.equal(recent.get('limit'),'20');
  assert.equal(recent.has('cursor'),false);
  assert.equal(recent.has('offset'),false);
  const history=unipileChatQuery('v2','acc_demo','history','old-cursor');
  assert.equal(history.get('limit'),'25');
  assert.equal(history.get('cursor'),'old-cursor');
  assert.equal(nextUnipileHistoryCursor({next_cursor:'new-cursor'},'old-cursor',25),'new-cursor');
  assert.equal(nextUnipileHistoryCursor({},'offset:25',25),'offset:50');
  assert.equal(nextUnipileHistoryCursor({},'offset:50',8),null);
  assert.equal(unipileChatQuery('v1','acc_demo','history','offset:50').get('offset'),'50');
});

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
