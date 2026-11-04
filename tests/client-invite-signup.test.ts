import assert from 'node:assert/strict';
import test from 'node:test';
import {clientInviteSignupSchema} from '../lib/client-invite-signup.js';

test('invite signup validates and normalizes owner input',()=>{
  assert.deepEqual(clientInviteSignupSchema.parse({name:'  Demo Owner ',email:' Owner@Example.com ',
    password:'long-enough-secret',inviteCode:' abc123 '}),{
    name:'Demo Owner',email:'owner@example.com',password:'long-enough-secret',inviteCode:'abc123'});
});

test('invite signup rejects malformed or unbounded input',()=>{
  const valid={name:'Demo Owner',email:'owner@example.com',password:'long-enough-secret',inviteCode:'abc123'};
  for(const input of [
    {...valid,email:'not an email'},
    {...valid,password:'short'},
    {...valid,password:'x'.repeat(129)},
    {...valid,inviteCode:'x'.repeat(257)},
    {...valid,client_account_id:'another-account'},
  ])assert.equal(clientInviteSignupSchema.safeParse(input).success,false);
});
