import assert from 'node:assert/strict';
import test from 'node:test';
import {Readable} from 'node:stream';

test('signed client view blocks direct legacy CRM reads and writes',async()=>{
  const keys=['SUPABASE_URL','SUPABASE_ANON_KEY','PORTAL_COOKIE_SECRET'] as const;
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const oldFetch=globalThis.fetch;
  Object.assign(process.env,{SUPABASE_URL:'https://supabase.test',SUPABASE_ANON_KEY:'anon-test',
    PORTAL_COOKIE_SECRET:'fixture-secret-at-least-thirty-two-characters'});
  const userId='20000000-0000-4000-8000-000000000001';
  const accountId='10000000-0000-4000-8000-000000000001';
  const token=`header.${Buffer.from(JSON.stringify({sub:userId,crm_role:'agency_admin',aal:'aal2'})).toString('base64url')}.signature`;
  const {signPortalSelection}=await import('../lib/portal-cookie.js');
  const {default:handler}=await import('../api/[...path].js');
  const cookie=`vs_portal=${signPortalSelection({userId,accountId,viewAsClient:true,issuedAt:Date.now()})}`;
  const calls:string[]=[];
  globalThis.fetch=async(input)=>{
    const path=new URL(String(input)).pathname;
    calls.push(path);
    if(path==='/auth/v1/user')return Response.json({id:userId,email:'admin@example.test',user_metadata:{}});
    throw Error(`Unexpected provider call: ${path}`);
  };
  async function request(method:string,url:string){
    const req=Readable.from([]) as unknown as Parameters<typeof handler>[0];
    Object.assign(req,{method,url,headers:{authorization:`Bearer ${token}`,cookie}});
    let output='';
    const res={statusCode:200,setHeader(){},end(value?:string){output=value||''}} as Parameters<typeof handler>[1];
    await handler(req,res);
    assert.equal(res.statusCode,403,output);
    assert.match(output,/Client view is read only/);
  }
  try{
    await request('GET','/api/leads');
    await request('GET','/api/companies');
    await request('POST','/api/pipelines');
    assert.deepEqual(calls,['/auth/v1/user','/auth/v1/user','/auth/v1/user']);
  }finally{
    globalThis.fetch=oldFetch;
    for(const key of keys){const value=previous[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
