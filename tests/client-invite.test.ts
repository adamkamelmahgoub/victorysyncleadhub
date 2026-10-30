import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clientInviteUrl} from '../lib/client-invite.js';

test('client invitation carries the code and owner details over HTTPS',()=>{
  const url=new URL(clientInviteUrl('abc123','owner@example.com','A & B Owner'));
  assert.equal(url.origin,'https://app.victorysync.com');
  assert.equal(url.pathname,'/login');
  assert.equal(url.searchParams.get('invite'),'abc123');
  assert.equal(url.searchParams.get('email'),'owner@example.com');
  assert.equal(url.searchParams.get('name'),'A & B Owner');
  assert.throws(()=>clientInviteUrl('abc','a@b.com','Owner','http://example.com'));
});
