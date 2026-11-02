import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {portalBillingReturnUrl} from '../lib/portal-billing-url.js';
import handler from '../api/portal.js';

test('Stripe billing return URL uses the configured HTTPS portal host',()=>{
  assert.equal(portalBillingReturnUrl('https://portal.victorysync.com/'),
    'https://portal.victorysync.com/client-portal/billing');
  assert.equal(portalBillingReturnUrl('https://app.victorysync.com'),
    'https://app.victorysync.com/client-portal/billing');
});

test('Stripe billing return URL rejects missing and unsafe configuration',()=>{
  for(const value of [undefined,'','http://portal.victorysync.com',
    'https://user:pass@portal.victorysync.com','https://portal.victorysync.com?next=evil',
    'https://portal.victorysync.com#fragment','not a URL'])
    assert.equal(portalBillingReturnUrl(value),null);
});

test('billing portal ignores a forged Host header and uses the configured return URL',async()=>{
  const previous={fetch:globalThis.fetch,portal:process.env.PORTAL_BASE_URL,
    stripe:process.env.STRIPE_SECRET_KEY,supabase:process.env.SUPABASE_URL,
    anon:process.env.SUPABASE_ANON_KEY};
  process.env.PORTAL_BASE_URL='https://portal.victorysync.com';
  process.env.STRIPE_SECRET_KEY='sk_test_fixture';
  process.env.SUPABASE_URL='https://supabase.test';
  process.env.SUPABASE_ANON_KEY='fixture-anon-key';
  let stripeBody='';
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.endsWith('/auth/v1/user'))return Response.json({id:'10000000-0000-4000-8000-000000000001'});
    if(url.endsWith('/rpc/auth_role'))return Response.json('client_owner');
    if(url.endsWith('/rpc/portal_accounts'))return Response.json([{id:'20000000-0000-4000-8000-000000000001'}]);
    if(url.endsWith('/rpc/portal_billing_customer'))return Response.json('cus_fixture');
    if(url.endsWith('/rpc/portal_log'))return Response.json(true);
    if(url.endsWith('/billing_portal/sessions')){
      stripeBody=String(init?.body);
      return Response.json({url:'https://billing.stripe.com/p/session_fixture'});
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const claims=Buffer.from(JSON.stringify({crm_role:'client_owner'})).toString('base64url');
    const req=Readable.from([JSON.stringify({action:'billing_portal'})]) as IncomingMessage;
    Object.assign(req,{method:'POST',url:'/api/portal',headers:{
      authorization:`Bearer header.${claims}.signature`,host:'attacker.example',
      'x-forwarded-proto':'http'}});
    let payload='';
    const res={statusCode:200,setHeader:()=>{},end:(value:string)=>{payload=value;}} as unknown as ServerResponse;
    await handler(req,res);
    assert.equal(res.statusCode,200,payload);
    assert.equal(new URLSearchParams(stripeBody).get('return_url'),
      'https://portal.victorysync.com/client-portal/billing');
  } finally {
    globalThis.fetch=previous.fetch;
    for(const [key,value] of [['PORTAL_BASE_URL',previous.portal],['STRIPE_SECRET_KEY',previous.stripe],
      ['SUPABASE_URL',previous.supabase],['SUPABASE_ANON_KEY',previous.anon]] as const)
      if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
