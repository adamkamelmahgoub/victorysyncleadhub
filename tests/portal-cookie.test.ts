import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPortalSelection,signPortalSelection} from '../lib/portal-cookie.js';

test('account selection requires a valid signature and the same user',()=>{
  const previous=process.env.PORTAL_COOKIE_SECRET;
  process.env.PORTAL_COOKIE_SECRET='local-test-secret-that-is-long-enough-for-hmac';
  try{
    const value={accountId:'f9b4126e-78a5-4cdc-92e8-d7f49fb8be5b',viewAsClient:true,
      userId:'a5f6f998-5ed5-4c0c-88ac-9f27d677697a',issuedAt:Date.now()};
    const cookie=`vs_portal=${signPortalSelection(value)}`;
    assert.deepEqual(readPortalSelection(cookie,value.userId),value);
    assert.equal(readPortalSelection(cookie,'00000000-0000-4000-8000-000000000000'),null);
    assert.equal(readPortalSelection(`${cookie}tampered`,value.userId),null);
    assert.equal(readPortalSelection(`vs_portal=${signPortalSelection({...value,issuedAt:Date.now()-8*86400_000})}`,value.userId),null);
  }finally{
    if(previous===undefined)delete process.env.PORTAL_COOKIE_SECRET;
    else process.env.PORTAL_COOKIE_SECRET=previous;
  }
});
