import test from 'node:test';
import assert from 'node:assert/strict';
import {externalSendsEnabled,requireExternalSends} from '../lib/external-send-mode.js';
import {ResendTransport} from '../lib/email-providers.js';
import {sendSocialReply} from '../lib/social-reply-service.js';

test('external delivery is enabled only in production without sandbox mode',()=>{
  assert.equal(externalSendsEnabled({VERCEL_ENV:'production',CLIENT_DELIVERY_SANDBOX:undefined}),true);
  assert.equal(externalSendsEnabled({VERCEL_ENV:'production',CLIENT_DELIVERY_SANDBOX:'1'}),false);
  assert.equal(externalSendsEnabled({VERCEL_ENV:'preview',CLIENT_DELIVERY_SANDBOX:undefined}),false);
  assert.equal(externalSendsEnabled({VERCEL_ENV:undefined,CLIENT_DELIVERY_SANDBOX:undefined}),false);
  assert.throws(()=>requireExternalSends({VERCEL_ENV:'preview',CLIENT_DELIVERY_SANDBOX:undefined}),/disabled/);
});

test('real Resend and social replies stop before a provider call in preview',async()=>{
  const before=process.env.VERCEL_ENV;
  process.env.VERCEL_ENV='preview';
  try{
    const resend=new ResendTransport('unused');
    await assert.rejects(()=>resend.send({jobId:'job',fromEmail:'sender@example.com',fromName:'Sender',to:'recipient@example.com',
      subject:'Test',text:'Test',messageId:'id',headers:{}}),/disabled/);
    await assert.rejects(()=>sendSocialReply('user','10000000-0000-4000-8000-000000000001','Test'),/disabled/);
  }finally{
    if(before===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=before;
  }
});
