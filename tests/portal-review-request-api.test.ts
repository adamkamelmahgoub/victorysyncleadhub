import assert from 'node:assert/strict';
import test from 'node:test';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
import handler from '../api/portal.js';
import {signPortalSelection} from '../lib/portal-cookie.js';

test('review request readiness errors are actionable client responses',async()=>{
  const userId='20000000-0000-4000-8000-000000000001';
  const accountId='10000000-0000-4000-8000-000000000001';
  const keys=['SUPABASE_URL','SUPABASE_ANON_KEY','PORTAL_COOKIE_SECRET'] as const;
  const oldEnv=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const oldFetch=globalThis.fetch;
  Object.assign(process.env,{SUPABASE_URL:'https://supabase.test',SUPABASE_ANON_KEY:'anon-test',
    PORTAL_COOKIE_SECRET:'fixture-secret-at-least-thirty-two-characters'});
  const token=`header.${Buffer.from(JSON.stringify({sub:userId,aal:'aal1'})).toString('base64url')}.signature`;
  const cookie=`vs_portal=${signPortalSelection({userId,accountId,viewAsClient:false,issuedAt:Date.now()})}`;
  globalThis.fetch=async(input)=>{
    const path=new URL(String(input)).pathname;
    if(path==='/auth/v1/user')return Response.json({id:userId,email:'owner@example.test'});
    if(path==='/rest/v1/rpc/auth_role')return Response.json('client_owner');
    if(path==='/rest/v1/rpc/portal_accounts')return Response.json([{id:accountId,name:'Own Account'}]);
    if(path==='/rest/v1/rpc/portal_request_review')return Response.json({message:'Add a Google review link before requesting reviews'},
      {status:400});
    throw Error(`Unexpected request: ${path}`);
  };
  try{
    const body={action:'request_review',name:'Alex Customer',phone:'+15125550101',leadId:null};
    const req=Readable.from([JSON.stringify(body)]) as IncomingMessage;
    Object.assign(req,{method:'POST',url:'/api/portal',headers:{authorization:`Bearer ${token}`,cookie}});
    let output='';
    const res={statusCode:200,setHeader(){},end(value?:string){output=value||''}} as unknown as ServerResponse;
    await handler(req,res);
    assert.equal(res.statusCode,400);
    assert.match(output,/Add a Google review link/);
  }finally{
    globalThis.fetch=oldFetch;
    for(const key of keys){const value=oldEnv[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
