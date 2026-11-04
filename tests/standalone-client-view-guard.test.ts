import assert from 'node:assert/strict';
import test from 'node:test';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';

test('client view blocks direct assistant and enrichment requests',async()=>{
  const keys=['SUPABASE_URL','SUPABASE_ANON_KEY','PORTAL_COOKIE_SECRET'] as const;
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const oldFetch=globalThis.fetch;
  Object.assign(process.env,{SUPABASE_URL:'https://supabase.test',SUPABASE_ANON_KEY:'anon-test',
    PORTAL_COOKIE_SECRET:'fixture-secret-at-least-thirty-two-characters'});
  const userId='20000000-0000-4000-8000-000000000001';
  const accountId='10000000-0000-4000-8000-000000000001';
  const {signPortalSelection}=await import('../lib/portal-cookie.js');
  const {default:assistant}=await import('../api/assistant.js');
  const {default:enrichment}=await import('../api/enrichment.js');
  const {default:social}=await import('../api/social-router.js');
  const cookie=`vs_portal=${signPortalSelection({userId,accountId,viewAsClient:true,issuedAt:Date.now()})}`;
  const calls:string[]=[];
  globalThis.fetch=async(input)=>{
    const path=new URL(String(input)).pathname;
    calls.push(path);
    if(path==='/auth/v1/user')return Response.json({id:userId,email:'admin@example.test',email_confirmed_at:'2026-01-01'});
    throw Error(`Unexpected provider call: ${path}`);
  };
  async function request(handler:typeof assistant|typeof enrichment,url:string){
    const req=Readable.from([]) as IncomingMessage;
    Object.assign(req,{method:'GET',url,headers:{authorization:'Bearer valid-fixture-token',cookie}});
    let output='';
    const res={statusCode:200,setHeader(){},end(value?:string){output=value||''}} as unknown as ServerResponse;
    await handler(req,res);
    assert.equal(res.statusCode,403,output);
    assert.match(output,/Client view is read only/);
  }
  try{
    await request(assistant,'/api/assistant?action=conversations');
    await request(enrichment,`/api/enrichment?action=lead&lead_id=${accountId}`);
    await request(social,'/api/social-inbox');
    await request(social,'/api/social-oauth');
    assert.deepEqual(calls,['/auth/v1/user','/auth/v1/user']);
  }finally{
    globalThis.fetch=oldFetch;
    for(const key of keys){const value=previous[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
