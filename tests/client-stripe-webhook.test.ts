import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
import handler,{verifyStripeSignature} from '../api/client-stripe-webhook.js';

const secret='whsec_fixture_only';
function signature(payload:Buffer,timestamp=Math.floor(Date.now()/1000)){
  return `t=${timestamp},v1=${createHmac('sha256',secret).update(Buffer.concat([
    Buffer.from(`${timestamp}.`),payload])).digest('hex')}`;
}

test('Stripe signature verifies exact raw bytes, rotation signatures, and freshness',()=>{
  const payload=Buffer.from('{"name":"Plumbing 🔧"}');
  const valid=signature(payload);
  assert.equal(verifyStripeSignature(payload,`v1=${'0'.repeat(64)},${valid}`,secret),true);
  assert.equal(verifyStripeSignature(Buffer.from('{"name":"Plumbing"}'),valid,secret),false);
  assert.equal(verifyStripeSignature(payload,signature(payload,Math.floor(Date.now()/1000)-301),secret),false);
  assert.equal(verifyStripeSignature(payload,'t=123,v1=nothex',secret),false);
});

test('signed checkout provisions one client from split UTF-8 chunks and sends its invite',async()=>{
  const keys=['VERCEL_ENV','CLIENT_DELIVERY_SANDBOX','STRIPE_WEBHOOK_SECRET','SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','INVITE_FROM_EMAIL','APP_URL','SLACK_WEBHOOK_URL'] as const;
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const previousFetch=globalThis.fetch;
  Object.assign(process.env,{VERCEL_ENV:'production',CLIENT_DELIVERY_SANDBOX:'0',
    STRIPE_WEBHOOK_SECRET:secret,SUPABASE_URL:'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY:'service_fixture',RESEND_API_KEY:'resend_fixture',
    INVITE_FROM_EMAIL:'invites@example.test',APP_URL:'https://app.victorysync.com'});
  delete process.env.SLACK_WEBHOOK_URL;
  const paths:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=String(input);paths.push(url);
    if(url.includes('/rpc/portal_create_client')){
      const body=JSON.parse(String(init?.body)) as Record<string,string>;
      assert.equal(body.p_package,'starter');
      assert.equal(body.p_owner_name,'Zoë 🔧');
      return Response.json({accountId:'20000000-0000-4000-8000-000000000001',inviteCode:'fixture-code',existing:false});
    }
    if(url==='https://api.resend.com/emails'){
      const body=JSON.parse(String(init?.body)) as {text:string};
      assert.match(body.text,/invite=fixture-code/);
      return Response.json({id:'email_fixture'});
    }
    return Response.json([]);
  };
  try{
    const event={id:'evt_fixture',type:'checkout.session.completed',data:{object:{
      id:'cs_fixture',object:'checkout.session',payment_status:'paid',customer:'cus_fixture',
      metadata:{company_id:'10000000-0000-4000-8000-000000000001',package:'starter',
        owner_email:'zoe@example.test',owner_name:'Zoë 🔧'}}}};
    const payload=Buffer.from(JSON.stringify(event));
    const emoji=payload.indexOf(Buffer.from('🔧'));
    const req=Readable.from([payload.subarray(0,emoji+1),payload.subarray(emoji+1)]) as IncomingMessage;
    Object.assign(req,{method:'POST',headers:{'stripe-signature':signature(payload)}});
    let body='';
    const res={statusCode:200,setHeader:()=>{},end:(value:string)=>{body=value;}} as unknown as ServerResponse;
    await handler(req,res);
    assert.equal(res.statusCode,200,body);
    assert.equal((JSON.parse(body) as {accountId:string}).accountId,
      '20000000-0000-4000-8000-000000000001');
    assert.equal(paths.some(path=>path.includes('/rpc/portal_create_client')),true);
    assert.equal(paths.some(path=>path.includes('/rpc/portal_mark_invite_sent')),true);
    assert.equal(paths.some(path=>path==='https://api.resend.com/emails'),true);
  }finally{
    globalThis.fetch=previousFetch;
    for(const key of keys){
      const value=previous[key];
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
});

test('unpaid checkout waits for the signed asynchronous payment success',async()=>{
  const keys=['VERCEL_ENV','CLIENT_DELIVERY_SANDBOX','STRIPE_WEBHOOK_SECRET','SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY','SLACK_WEBHOOK_URL'] as const;
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const previousFetch=globalThis.fetch;
  Object.assign(process.env,{VERCEL_ENV:'production',CLIENT_DELIVERY_SANDBOX:'0',
    STRIPE_WEBHOOK_SECRET:secret,SUPABASE_URL:'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY:'service_fixture'});
  delete process.env.SLACK_WEBHOOK_URL;
  const paths:string[]=[];
  globalThis.fetch=async(input)=>{
    const url=String(input);paths.push(url);
    if(url.includes('/rpc/portal_create_client'))
      return Response.json({accountId:'20000000-0000-4000-8000-000000000001',existing:true});
    return Response.json([]);
  };
  async function deliver(type:string,paymentStatus:string){
    const payload=Buffer.from(JSON.stringify({id:'evt_async_fixture',type,data:{object:{
      id:'cs_async_fixture',object:'checkout.session',payment_status:paymentStatus,
      customer:'cus_fixture',metadata:{company_id:'10000000-0000-4000-8000-000000000001',
        package:'scale',owner_email:'owner@example.test',owner_name:'Demo Owner'}}}}));
    const req=Readable.from([payload]) as IncomingMessage;
    Object.assign(req,{method:'POST',headers:{'stripe-signature':signature(payload)}});
    let body='';
    const res={statusCode:200,setHeader:()=>{},end:(value:string)=>{body=value;}} as unknown as ServerResponse;
    await handler(req,res);
    return {status:res.statusCode,body:JSON.parse(body) as Record<string,unknown>};
  }
  try{
    assert.deepEqual(await deliver('checkout.session.completed','unpaid'),
      {status:200,body:{received:true,pendingPayment:true}});
    assert.deepEqual(paths,[]);
    const success=await deliver('checkout.session.async_payment_succeeded','paid');
    assert.equal(success.status,200);
    assert.equal(success.body.accountId,'20000000-0000-4000-8000-000000000001');
    assert.equal(paths.filter(path=>path.includes('/rpc/portal_create_client')).length,1);
  }finally{
    globalThis.fetch=previousFetch;
    for(const key of keys){
      const value=previous[key];
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
});
