import test from 'node:test';
import assert from 'node:assert/strict';

const accountId='10000000-0000-4000-8000-000000000001';
const leadId='20000000-0000-4000-8000-000000000001';
const jobId='30000000-0000-4000-8000-000000000001';
type Scenario={existingLead:boolean;recentText:boolean;optedOut:boolean};

async function runScenario(scenario:Scenario){
  const keys=['VERCEL_ENV','CLIENT_DELIVERY_SANDBOX','CLIENT_DELIVERY_WORKER_SECRET','SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY','MIGHTYCALL_API_KEY','MIGHTYCALL_SECRET_KEY'] as const;
  const old=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const originalFetch=globalThis.fetch;
  Object.assign(process.env,{VERCEL_ENV:'production',CLIENT_DELIVERY_SANDBOX:'0',
    CLIENT_DELIVERY_WORKER_SECRET:'missed-call-test',SUPABASE_URL:'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY:'test-service-key',MIGHTYCALL_API_KEY:'test-api-key',
    MIGHTYCALL_SECRET_KEY:'test-user-key'});
  const result={newLeads:0,linkedCalls:0,sms:[] as string[],jobStatus:'',usedNormalizedPhone:false};
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    const method=init?.method||'GET';
    const body=init?.body&&!(init.body instanceof URLSearchParams)
      ?JSON.parse(String(init.body)) as Record<string,unknown>:{};
    if(url.pathname==='/rest/v1/mightycall_webhook_inbox')return Response.json(url.searchParams.has('external_call_id')?[{
      id:'40000000-0000-4000-8000-000000000001',external_call_id:'call-1',
      call_status:'missed',call_direction:'incoming'}]:[]);
    if(url.pathname==='/rest/v1/sub_accounts')return Response.json(url.searchParams.has('id')?[{
      id:accountId,name:'Demo Plumbing',owner_email:'owner@example.test',package:'starter',
      mightycall_number:'+15125550100',settings:{}}]:[]);
    if(url.pathname==='/rest/v1/rpc/client_claim_jobs')return Response.json([{
      id:jobId,client_account_id:accountId,lead_id:null,workflow_id:'50000000-0000-4000-8000-000000000001',
      kind:'missed_call_text',source_id:'call:call-1',attempts:1,payload:{}}]);
    if(url.pathname==='/rest/v1/rpc/client_delivery_enabled')return Response.json(true);
    if(url.pathname==='/rest/v1/rpc/client_phone_dnc')return Response.json(scenario.optedOut);
    if(url.pathname==='/v4/auth/token')return Response.json({access_token:'test-mighty-token',expires_in:3600});
    if(url.pathname==='/v4/api/calls/call-1')return Response.json({businessNumber:'+15125550100',
      caller:{phone:'+15125550101'},callStatus:'missed',direction:'incoming'});
    if(url.pathname==='/rest/v1/leads'&&method==='GET'){
      result.usedNormalizedPhone=url.searchParams.get('normalized_phone')==='eq.+15125550101';
      return Response.json(scenario.existingLead?[{id:leadId,phone:'(512) 555-0101',dnc:false}]:[]);
    }
    if(url.pathname==='/rest/v1/leads'&&method==='POST'){
      result.newLeads++;return Response.json([{id:leadId}]);
    }
    if(url.pathname==='/rest/v1/client_call_details'&&method==='PATCH'){
      assert.equal(body.lead_id,leadId);result.linkedCalls++;return Response.json([]);
    }
    if(url.pathname==='/rest/v1/mightycall_sms_messages'&&method==='GET'){
      return Response.json(url.search.includes('automation_kind')&&scenario.recentText?[{id:'prior-sms'}]:[]);
    }
    if(url.pathname==='/rest/v1/mightycall_sms_messages'&&method==='POST')return Response.json([]);
    if(url.pathname==='/v4/api/messages/send'){
      result.sms.push(String(body.message));return Response.json({id:'sms-1'});
    }
    if(url.pathname==='/rest/v1/client_automation_jobs'&&method==='PATCH'){
      result.jobStatus=String(body.status);return Response.json([]);
    }
    if(url.pathname==='/rest/v1/automation_runs')return Response.json([]);
    throw Error(`Unexpected request ${method} ${url.pathname}`);
  };
  try{
    const {default:handler}=await import('../api/client-delivery-worker.js');
    let status=0;
    await handler({method:'GET',headers:{authorization:'Bearer missed-call-test'}} as never,
      {setHeader(){},set statusCode(value:number){status=value},end(){}} as never);
    assert.equal(status,200);
    return result;
  }finally{
    globalThis.fetch=originalFetch;
    for(const key of keys){const value=old[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
}

test('first missed call creates a lead, links its log, and texts with opt-out language',async()=>{
  const result=await runScenario({existingLead:false,recentText:false,optedOut:false});
  assert.equal(result.newLeads,1);
  assert.equal(result.linkedCalls,1);
  assert.equal(result.sms.length,1);
  assert.match(result.sms[0]!,/Reply STOP to opt out/);
  assert.equal(result.jobStatus,'sent');
});

test('second missed call within 24 hours links an existing formatted-number lead without another text',async()=>{
  const result=await runScenario({existingLead:true,recentText:true,optedOut:false});
  assert.equal(result.usedNormalizedPhone,true);
  assert.equal(result.newLeads,0);
  assert.equal(result.linkedCalls,1);
  assert.deepEqual(result.sms,[]);
  assert.equal(result.jobStatus,'cancelled');
});

test('opted-out caller gets neither a new lead nor another text',async()=>{
  const result=await runScenario({existingLead:false,recentText:false,optedOut:true});
  assert.equal(result.newLeads,0);
  assert.equal(result.linkedCalls,0);
  assert.deepEqual(result.sms,[]);
  assert.equal(result.jobStatus,'cancelled');
});
