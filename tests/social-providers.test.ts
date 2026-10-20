import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { parseMetaWebhook, parseWhatsAppWebhook, replyAllowed, verifyMetaSignature } from '../lib/social-providers.ts';

test('Meta signature checks raw bytes', () => {
  const raw = Buffer.from('{"entry":[]}');
  const signature = `sha256=${createHmac('sha256', 'secret').update(raw).digest('hex')}`;
  assert.equal(verifyMetaSignature(raw, signature, 'secret'), true);
  assert.equal(verifyMetaSignature(Buffer.from('{}'), signature, 'secret'), false);
});
test('Meta message echoes remain outbound events', () => {
  const events = parseMetaWebhook({ object:'instagram', entry:[{ id:'business', messaging:[
    { sender:{id:'business'}, recipient:{id:'customer'}, timestamp:1000, message:{mid:'m1',text:'hi',is_echo:true} },
  ] }] });
  assert.equal(events.length, 1);
  assert.equal(events[0].isEcho, true);
  assert.equal(events[0].externalMessageId, 'm1');
});
test('WhatsApp message parser ignores status updates', () => {
  const events = parseWhatsAppWebhook({ object:'whatsapp_business_account', entry:[{ changes:[{ value:{ metadata:{phone_number_id:'123'},
    messages:[{id:'wamid.1',from:'15551234',timestamp:'100',type:'text',text:{body:'Hello'}}], statuses:[{id:'outbound'}] } }] }] });
  assert.equal(events.length, 1);
  assert.equal(events[0].body, 'Hello');
});
test('reply window closes at 24 hours', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  assert.equal(replyAllowed('instagram', new Date(now.getTime()-23*3600000), now), true);
  assert.equal(replyAllowed('instagram', new Date(now.getTime()-24*3600000), now), false);
  assert.equal(replyAllowed('linkedin', now, now), false);
});
