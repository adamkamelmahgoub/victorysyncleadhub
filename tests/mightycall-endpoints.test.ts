import test from 'node:test';
import assert from 'node:assert/strict';
import {mightyCallProduct,mightyCallUrl,mightyCallAuthUrl} from '../lib/mightycall-endpoints.js';

test('MightyCall Classic and Call Center use their documented hosts and SMS paths',()=>{
  assert.equal(mightyCallProduct(undefined),'classic');
  assert.equal(mightyCallAuthUrl('classic'),'https://api.mightycall.com/v4/auth/token');
  assert.equal(mightyCallUrl('classic','messages/send'),'https://api.mightycall.com/v4/api/messages/send');
  assert.equal(mightyCallAuthUrl('call_center'),'https://ccapi.mightycall.com/v4/auth/token');
  assert.equal(mightyCallUrl('call_center','messages/send'),'https://ccapi.mightycall.com/v4/api/contactcenter/messages/send');
  assert.equal(mightyCallUrl('call_center','calls/1234'),'https://ccapi.mightycall.com/v4/api/calls/1234');
  assert.throws(()=>mightyCallProduct('unknown'));
  assert.throws(()=>mightyCallUrl('classic','https://other.example/'));
});
