import assert from 'node:assert/strict';
import test from 'node:test';

test('provider failure records a failed job and automation run for agency retry',async()=>{
  const account='10000000-0000-4000-8000-000000000001';
  const lead='20000000-0000-4000-8000-000000000001';
  const submission='30000000-0000-4000-8000-000000000001';
  const job='40000000-0000-4000-8000-000000000001';
  const keys=['VERCEL_ENV','CLIENT_DELIVERY_SANDBOX','CLIENT_DELIVERY_WORKER_SECRET','SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','REPORT_FROM_EMAIL'] as const;
  const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const priorFetch=globalThis.fetch;
  Object.assign(process.env,{VERCEL_ENV:'production',CLIENT_DELIVERY_SANDBOX:'0',
    CLIENT_DELIVERY_WORKER_SECRET:'failure-log-test',SUPABASE_URL:'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY:'service-fixture',RESEND_API_KEY:'resend-fixture',
    REPORT_FROM_EMAIL:'reports@example.test'});
  let jobPatch:Record<string,unknown>|null=null,runPatch:Record<string,unknown>|null=null;
  let runInsert:Record<string,unknown>|null=null,emails=0,claimed=false;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input)),method=init?.method||'GET';
    const body=typeof init?.body==='string'?JSON.parse(init.body) as Record<string,unknown>:{};
    if(url.pathname==='/rest/v1/mightycall_webhook_inbox')return Response.json([]);
    if(url.pathname==='/rest/v1/sub_accounts')return Response.json(url.searchParams.has('id')?[{
      id:account,name:'Demo Plumbing',owner_email:'owner@example.test',package:'starter',settings:{}}]:[]);
    if(url.pathname==='/rest/v1/rpc/client_claim_jobs'){
      if(claimed)return Response.json([]);
      claimed=true;return Response.json([{id:job,client_account_id:account,lead_id:lead,
        workflow_id:'50000000-0000-4000-8000-000000000001',kind:'lead_email',
        source_id:submission,attempts:2,payload:{}}]);
    }
    if(url.pathname==='/rest/v1/rpc/client_delivery_enabled')return Response.json(true);
    if(url.pathname==='/rest/v1/leads')return Response.json([{
      id:lead,email:'customer@example.test',phone:'+15125550101',dnc:false,first_name:'Alex'}]);
    if(url.pathname==='/rest/v1/form_submissions')return Response.json([{
      id:submission,form_id:'60000000-0000-4000-8000-000000000001',
      data:{email:'customer@example.test'},created_at:'2026-11-01T00:00:00Z'}]);
    if(url.pathname==='/emails'){emails++;return Response.json({message:'Provider unavailable'},{status:503});}
    if(url.pathname==='/rest/v1/client_automation_jobs'&&method==='PATCH'){
      jobPatch=body;return Response.json([]);
    }
    if(url.pathname==='/rest/v1/automation_runs'){
      if(method==='POST')runInsert=body;else if(method==='PATCH')runPatch=body;
      return Response.json([]);
    }
    throw Error(`Unexpected request ${method} ${url.pathname}`);
  };
  try{
    const {default:handler}=await import('../api/client-delivery-worker.js');
    let status=0;
    await handler({method:'GET',headers:{authorization:'Bearer failure-log-test'}} as never,
      {setHeader(){},set statusCode(value:number){status=value},end(){}} as never);
    assert.equal(status,200);
    assert.equal(emails,1);
    assert.equal(runInsert?.job_id,job);
    assert.equal(runInsert?.status,'running');
    assert.equal(jobPatch?.status,'failed');
    assert.equal(jobPatch?.last_error,'Email delivery 503');
    assert.ok(new Date(String(jobPatch?.run_at)).getTime()>Date.now());
    assert.equal(runPatch?.status,'failed');
    assert.equal(runPatch?.error,'Email delivery 503');
  }finally{
    globalThis.fetch=priorFetch;
    for(const key of keys){const value=before[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
