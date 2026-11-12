import assert from 'node:assert/strict';
import test from 'node:test';
import {providerReadiness} from '../lib/provider-readiness.js';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
import handler from '../api/portal.js';

test('provider readiness reports missing settings without exposing values', () => {
  const readiness = providerReadiness({VERCEL_ENV:'production',CLIENT_DELIVERY_SANDBOX:'1',
    STRIPE_SECRET_KEY:'sk_test_sensitive',MIGHTYCALL_API_KEY:'sensitive'});
  assert.equal(readiness.sandbox,true);
  assert.equal(readiness.stripe,false);
  assert.equal(readiness.mightycall,false);
  assert.equal(JSON.stringify(readiness).includes('sensitive'),false);
});

test('provider readiness requires both senders and valid HTTPS origins', () => {
  const readiness = providerReadiness({VERCEL_ENV:'production',RESEND_API_KEY:'key',
    INVITE_FROM_EMAIL:'invite@example.com',REPORT_FROM_EMAIL:'reports@example.com',
    PORTAL_BASE_URL:'https://portal.example.com',PUBLIC_PAGES_BASE_URL:'http://pages.example.com'});
  assert.equal(readiness.sandbox,false);
  assert.equal(readiness.invites,true);
  assert.equal(readiness.reports,true);
  assert.equal(readiness.portalUrl,true);
  assert.equal(readiness.publicPagesUrl,false);
});

test('provider readiness route is agency-admin only and returns no secrets', async () => {
  const prior={fetch:globalThis.fetch,url:process.env.SUPABASE_URL,key:process.env.SUPABASE_ANON_KEY,
    stripe:process.env.STRIPE_SECRET_KEY};
  process.env.SUPABASE_URL='https://supabase.test';
  process.env.SUPABASE_ANON_KEY='anon-fixture';
  process.env.STRIPE_SECRET_KEY='sk_sensitive_fixture';
  let role='client_owner';
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url.endsWith('/auth/v1/user'))return Response.json({id:'10000000-0000-4000-8000-000000000001'});
    if(url.endsWith('/rpc/auth_role'))return Response.json(role);
    throw new Error(`Unexpected request: ${url}`);
  };
  const invoke=async()=>{
    const claims=Buffer.from(JSON.stringify({aal:'aal2'})).toString('base64url');
    const req=Readable.from([]) as IncomingMessage;
    Object.assign(req,{method:'GET',url:'/api/portal?action=provider_readiness',
      headers:{authorization:`Bearer header.${claims}.signature`}});
    let payload='';
    const res={statusCode:200,setHeader:()=>{},end:(value:string)=>{payload=value;}} as unknown as ServerResponse;
    await handler(req,res);
    return {status:res.statusCode,body:JSON.parse(payload) as Record<string,unknown>};
  };
  try {
    assert.equal((await invoke()).status,403);
    role='agency_staff';
    assert.equal((await invoke()).status,403);
    role='agency_admin';
    const admin=await invoke();
    assert.equal(admin.status,200);
    assert.equal(admin.body.stripe,false);
    assert.equal(JSON.stringify(admin.body).includes('sk_sensitive_fixture'),false);
  } finally {
    globalThis.fetch=prior.fetch;
    for(const [key,value] of [['SUPABASE_URL',prior.url],['SUPABASE_ANON_KEY',prior.key],
      ['STRIPE_SECRET_KEY',prior.stripe]] as const)
      if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
