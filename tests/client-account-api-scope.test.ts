import assert from 'node:assert/strict';
import test from 'node:test';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
import handler from '../api/portal.js';
import {signPortalSelection} from '../lib/portal-cookie.js';

test('client direct portal routes reject another account before data RPCs',async()=>{
  const userId='20000000-0000-4000-8000-000000000003';
  const ownId='10000000-0000-4000-8000-000000000001';
  const otherId='10000000-0000-4000-8000-000000000002';
  const oldFetch=globalThis.fetch;
  const keys=['SUPABASE_URL','SUPABASE_ANON_KEY','PORTAL_COOKIE_SECRET'] as const;
  const oldEnv=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  Object.assign(process.env,{SUPABASE_URL:'https://supabase.test',SUPABASE_ANON_KEY:'anon-test',
    PORTAL_COOKIE_SECRET:'fixture-secret-at-least-thirty-two-characters'});
  const token=`header.${Buffer.from(JSON.stringify({sub:userId,aal:'aal1'})).toString('base64url')}.signature`;
  const cookie=`vs_portal=${signPortalSelection({userId,accountId:otherId,viewAsClient:false,issuedAt:Date.now()})}`;
  const dataCalls:string[]=[];
  globalThis.fetch=async(input)=>{
    const path=new URL(String(input)).pathname;
    if(path==='/auth/v1/user')return Response.json({id:userId,email:'owner@example.test'});
    if(path==='/rest/v1/rpc/auth_role')return Response.json('client_owner');
    if(path==='/rest/v1/rpc/portal_accounts')return Response.json([{id:ownId,name:'Own Account'}]);
    dataCalls.push(path);
    return Response.json({unexpected:path});
  };
  async function request(method:'GET'|'POST',url:string,body?:Record<string,unknown>){
    const req=Readable.from(body?[JSON.stringify(body)]:[]) as IncomingMessage;
    Object.assign(req,{method,url,headers:{authorization:`Bearer ${token}`,cookie}});
    let output='';
    const res={statusCode:200,setHeader(){},end(value?:string){output=value||''}} as unknown as ServerResponse;
    await handler(req,res);
    return {status:res.statusCode,data:JSON.parse(output) as {error?:string}};
  }
  const id='30000000-0000-4000-8000-000000000001';
  const range='from=2026-11-01T00%3A00%3A00.000Z&to=2026-11-30T00%3A00%3A00.000Z';
  const queries=[
    'action=launchpad',`action=metrics&${range}`,`action=lead_timeline&leadId=${id}`,
    'action=won_leads&query=smith','action=review_summary','action=review_page&kind=reviews',
    `action=lead_page&beforeAt=2026-11-01T00%3A00%3A00.000Z&beforeId=${id}`,
    'action=ad_spend','action=page_stats','action=page_edit_allowed',
    `action=page_versions&pageId=${id}`,`action=report_file&reportId=${id}`,
    'action=reports','action=report_recipients','action=billing_summary',
    'action=branding','action=client_settings','action=usage',`action=calls&${range}`,
    'action=staff','action=snapshot&section=leads','action=snapshot&section=pages',
    'action=snapshot&section=forms','action=snapshot&section=reviews',
    'action=snapshot&section=reports','action=snapshot&section=billing',
    'action=export&section=leads',
  ];
  try{
    for(const query of queries){
      const result=await request('GET',`/api/portal?${query}`);
      assert.equal(result.status,403,query);
      assert.match(result.data.error||'',/Access denied/,query);
    }
    for(const body of [
      {action:'set_job_value',leadId:id,value:100},
      {action:'request_review',name:'Customer',phone:'+15551234567',leadId:id},
      {action:'billing_portal'},
      {action:'publish_page',pageId:id},
    ]){
      const result=await request('POST','/api/portal',body);
      assert.equal(result.status,403,body.action);
    }
    assert.deepEqual(dataCalls,[]);
  }finally{
    globalThis.fetch=oldFetch;
    for(const key of keys){const value=oldEnv[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
