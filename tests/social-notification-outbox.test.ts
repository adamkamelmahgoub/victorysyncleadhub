import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSocialAlert} from '../lib/social-notification-outbox.js';

test('booking alert includes the lead and a valid scheduled time',()=>{
  const text=renderSocialAlert({event:'audit_booked',lead_id:'12345678-1234-1234-1234-123456789abc',scheduled_at:'2026-10-21T18:00:00Z'});
  assert.match(text,/Audit booked for 2026-10-21T18:00:00.000Z/);
  assert.match(text,/\/leads\/12345678-1234-1234-1234-123456789abc/);
});
test('payment and refund values are formatted from cents',()=>{
  assert.match(renderSocialAlert({event:'payment',amount_cents:1099}),/\$10\.99/);
  assert.match(renderSocialAlert({event:'refund',amount_cents:-2400}),/\$24\.00/);
});
test('unsupported alerts never produce a Slack message',()=>{
  assert.throws(()=>renderSocialAlert({event:'unknown'}));
});
