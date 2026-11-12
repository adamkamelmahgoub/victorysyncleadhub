import assert from 'node:assert/strict';
import test from 'node:test';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
import handler from '../api/portal.js';
import {signPortalSelection} from '../lib/portal-cookie.js';

test('agency staff cannot select or query an unassigned client account',async()=>{
  const userId='20000000-0000-4000-8000-000000000002';
  const assignedId='10000000-0000-4000-8000-000000000001';
  const otherId='10000000-0000-4000-8000-000000000002';
  const envKeys=['SUPABASE_URL','SUPABASE_ANON_KEY','PORTAL_COOKIE_SECRET'] as const;
  const oldEnv=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
  const oldFetch=globalThis.fetch;
  Object.assign(process.env,{SUPABASE_URL:'https://supabase.test',SUPABASE_ANON_KEY:'anon-test',
    PORTAL_COOKIE_SECRET:'fixture-secret-at-least-thirty-two-characters'});
  const token=`header.${Buffer.from(JSON.stringify({sub:userId,aal:'aal2'})).toString('base64url')}.signature`;
  const staleCookie=`vs_portal=${signPortalSelection({userId,accountId:otherId,viewAsClient:false,issuedAt:Date.now()})}`;
  const calls:string[]=[];
  globalThis.fetch=async(input)=>{
    const path=new URL(String(input)).pathname;
    if(path==='/auth/v1/user')return Response.json({id:userId,email:'staff@example.test'});
    if(path==='/rest/v1/rpc/auth_role')return Response.json('agency_staff');
    if(path==='/rest/v1/rpc/portal_accounts')return Response.json([{id:assignedId,name:'Assigned Plumbing'}]);
    if(path==='/rest/v1/rpc/portal_log'){calls.push('log');return Response.json(null);}
    if(path==='/rest/v1/rpc/portal_dashboard_metrics'){calls.push('metrics');return Response.json({leads:1});}
    throw Error(`Unexpected provider call: ${path}`);
  };
  async function request(method:'GET'|'POST',url:string,cookie:string,body?:Record<string,unknown>){
    const req=Readable.from(body?[JSON.stringify(body)]:[]) as IncomingMessage;
    Object.assign(req,{method,url,headers:{authorization:`Bearer ${token}`,cookie}});
    let output='';
    const res={statusCode:200,setHeader(){},end(value?:string){output=value||''}} as unknown as ServerResponse;
    await handler(req,res);
    return {status:res.statusCode,data:JSON.parse(output) as Record<string,unknown>};
  }
  try{
    const accounts=await request('GET','/api/portal?action=accounts',staleCookie);
    assert.equal(accounts.status,200);
    assert.deepEqual(accounts.data.accounts,[{id:assignedId,name:'Assigned Plumbing'}]);
    assert.equal(accounts.data.selected,null);
    assert.equal((await request('GET','/api/portal?action=metrics&from=2026-11-01T00:00:00.000Z&to=2026-11-30T00:00:00.000Z',staleCookie)).status,403);
    assert.equal((await request('POST','/api/portal',staleCookie,{action:'switch',accountId:otherId,
      viewAsClient:false})).status,403);
    assert.deepEqual(calls,[]);
    const assignedCookie=`vs_portal=${signPortalSelection({userId,accountId:assignedId,
      viewAsClient:false,issuedAt:Date.now()})}`;
    const metrics=await request('GET','/api/portal?action=metrics&from=2026-11-01T00:00:00.000Z&to=2026-11-30T00:00:00.000Z',assignedCookie);
    assert.equal(metrics.status,200);
    assert.deepEqual(calls,['metrics']);
  }finally{
    globalThis.fetch=oldFetch;
    for(const key of envKeys){const value=oldEnv[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
