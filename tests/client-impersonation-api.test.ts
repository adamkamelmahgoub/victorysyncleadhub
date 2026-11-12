import assert from 'node:assert/strict';
import test from 'node:test';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
import handler from '../api/portal.js';
import {signPortalSelection} from '../lib/portal-cookie.js';

test('agency client view hides other accounts and denies agency writes until exit',async()=>{
  const userId='20000000-0000-4000-8000-000000000001';
  const accountId='10000000-0000-4000-8000-000000000001';
  const otherId='10000000-0000-4000-8000-000000000002';
  const envKeys=['SUPABASE_URL','SUPABASE_ANON_KEY','PORTAL_COOKIE_SECRET'] as const;
  const oldEnv=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
  const oldFetch=globalThis.fetch;
  Object.assign(process.env,{SUPABASE_URL:'https://supabase.test',SUPABASE_ANON_KEY:'anon-test',
    PORTAL_COOKIE_SECRET:'fixture-secret-at-least-thirty-two-characters'});
  const token=`header.${Buffer.from(JSON.stringify({sub:userId,aal:'aal2'})).toString('base64url')}.signature`;
  const cookie=`vs_portal=${signPortalSelection({userId,accountId,viewAsClient:true,issuedAt:Date.now()})}`;
  const calls:string[]=[];
  globalThis.fetch=async(input)=>{
    const path=new URL(String(input)).pathname;
    if(path==='/auth/v1/user')return Response.json({id:userId,email:'admin@example.test'});
    if(path==='/rest/v1/rpc/auth_role')return Response.json('agency_admin');
    if(path==='/rest/v1/rpc/portal_accounts'){
      calls.push('accounts');
      return Response.json([{id:accountId,name:'Demo Plumbing'},{id:otherId,name:'Other HVAC'}]);
    }
    if(path==='/rest/v1/rpc/portal_log'){
      calls.push('log');
      return Response.json(null);
    }
    throw Error(`Unexpected provider call: ${path}`);
  };
  async function request(method:'GET'|'POST',url:string,body?:Record<string,unknown>){
    const req=Readable.from(body?[JSON.stringify(body)]:[]) as IncomingMessage;
    Object.assign(req,{method,url,headers:{authorization:`Bearer ${token}`,cookie}});
    let output='';
    const res={statusCode:200,setHeader(){},end(value?:string){output=value||''}} as unknown as ServerResponse;
    await handler(req,res);
    return {status:res.statusCode,data:JSON.parse(output) as Record<string,unknown>};
  }
  try{
    const accounts=await request('GET','/api/portal?action=accounts');
    assert.equal(accounts.status,200);
    assert.deepEqual(accounts.data.accounts,[{id:accountId,name:'Demo Plumbing'}]);
    assert.equal((await request('GET','/api/portal?action=agency_overview')).status,403);
    assert.equal((await request('POST','/api/portal',{action:'apply_template',accountId,template:'starter'})).status,403);
    assert.equal((await request('POST','/api/portal',{action:'set_feature',feature:'client_portal',enabled:true,userId:null})).status,403);
    assert.deepEqual(calls,['accounts']);
    const exited=await request('POST','/api/portal',{action:'switch',accountId,viewAsClient:false});
    assert.equal(exited.status,200);
    assert.equal(calls.filter(call=>call==='log').length,2);
  }finally{
    globalThis.fetch=oldFetch;
    for(const key of envKeys){const value=oldEnv[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
