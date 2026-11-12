import assert from 'node:assert/strict';
import test from 'node:test';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
import handler from '../api/portal.js';

test('repeating client creation does not send another new-client alert',async()=>{
  const keys=['SUPABASE_URL','SUPABASE_ANON_KEY','VERCEL_ENV','CLIENT_DELIVERY_SANDBOX',
    'SLACK_WEBHOOK_URL','RESEND_API_KEY','INVITE_FROM_EMAIL'] as const;
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const oldFetch=globalThis.fetch;
  Object.assign(process.env,{SUPABASE_URL:'https://supabase.test',SUPABASE_ANON_KEY:'anon-test',
    VERCEL_ENV:'production',CLIENT_DELIVERY_SANDBOX:'0',SLACK_WEBHOOK_URL:'https://slack.test/webhook'});
  delete process.env.RESEND_API_KEY;
  delete process.env.INVITE_FROM_EMAIL;
  const userId='20000000-0000-4000-8000-000000000001';
  const accountId='10000000-0000-4000-8000-000000000001';
  const token=`header.${Buffer.from(JSON.stringify({sub:userId,aal:'aal2'})).toString('base64url')}.signature`;
  let created=0;
  let alerts=0;
  globalThis.fetch=async(input)=>{
    const url=new URL(String(input));
    if(url.hostname==='slack.test'){alerts++;return new Response('ok',{status:200});}
    if(url.pathname==='/auth/v1/user')return Response.json({id:userId,email:'admin@example.test'});
    if(url.pathname==='/rest/v1/rpc/auth_role')return Response.json('agency_admin');
    if(url.pathname==='/rest/v1/rpc/portal_create_client_manual'){
      created++;
      return Response.json({accountId,existing:created>1,inviteCode:created===1?'invite-code':null});
    }
    if(url.pathname==='/rest/v1/rpc/portal_apply_account_template')return Response.json({accountId});
    throw Error(`Unexpected provider call: ${url.pathname}`);
  };
  async function create(){
    const body={action:'create_client_manual',name:'Demo Plumbing',phone:'+15555550100',
      website:'https://example.test',package:'starter',ownerEmail:'owner@example.test',ownerName:'Demo Owner'};
    const req=Readable.from([JSON.stringify(body)]) as IncomingMessage;
    Object.assign(req,{method:'POST',url:'/api/portal',headers:{authorization:`Bearer ${token}`}});
    let output='';
    const res={statusCode:200,setHeader(){},end(value?:string){output=value||''}} as unknown as ServerResponse;
    await handler(req,res);
    assert.equal(res.statusCode,201,output);
  }
  try{
    await create();
    await create();
    assert.equal(created,2);
    assert.equal(alerts,1);
  }finally{
    globalThis.fetch=oldFetch;
    for(const key of keys){const value=previous[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
