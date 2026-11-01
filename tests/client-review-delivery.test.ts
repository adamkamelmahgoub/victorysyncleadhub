import test from 'node:test';
import assert from 'node:assert/strict';

const accountId='10000000-0000-4000-8000-000000000001';
const leadId='20000000-0000-4000-8000-000000000001';
const requestId='30000000-0000-4000-8000-000000000001';
const jobId='40000000-0000-4000-8000-000000000001';
type Scenario={kind:'review_request'|'review_reminder';leadPhone:string;dnc?:boolean;clicked?:boolean};

async function runScenario(scenario:Scenario){
  const envKeys=['VERCEL_ENV','CLIENT_DELIVERY_SANDBOX','CLIENT_DELIVERY_WORKER_SECRET','SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY','MIGHTYCALL_API_KEY','MIGHTYCALL_SECRET_KEY','RESEND_API_KEY',
    'REPORT_FROM_EMAIL'] as const;
  const before=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
  Object.assign(process.env,{VERCEL_ENV:'production',CLIENT_DELIVERY_SANDBOX:'0',
    CLIENT_DELIVERY_WORKER_SECRET:'review-worker-test',SUPABASE_URL:'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY:'test-service-key',MIGHTYCALL_API_KEY:'test-api-key',
    MIGHTYCALL_SECRET_KEY:'test-user-key',RESEND_API_KEY:'test-resend-key',
    REPORT_FROM_EMAIL:'reports@example.test'});
  const originalFetch=globalThis.fetch;
  const sent:{sms:string[];emails:string[];reminders:number;requestStatuses:string[];jobStatuses:string[];errors:string[]}={
    sms:[],emails:[],reminders:0,requestStatuses:[],jobStatuses:[],errors:[]};
  let claimed=false;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    const method=init?.method||'GET';
    const body=init?.body&&!(init.body instanceof URLSearchParams)
      ?JSON.parse(String(init.body)) as Record<string,unknown>:{};
    if(url.pathname==='/rest/v1/mightycall_webhook_inbox')return Response.json([]);
    if(url.pathname==='/rest/v1/sub_accounts')return Response.json(url.searchParams.has('id')?[{
      id:accountId,name:'Demo Plumbing',owner_email:'owner@example.test',package:'starter',
      mightycall_number:'+15125550100',google_review_link:'https://example.test/review',settings:{}}]:[]);
    if(url.pathname==='/rest/v1/rpc/client_claim_jobs'){
      if(claimed)return Response.json([]);
      claimed=true;
      return Response.json([{id:jobId,client_account_id:accountId,lead_id:leadId,
        workflow_id:'50000000-0000-4000-8000-000000000001',kind:scenario.kind,
        source_id:`request:${requestId}`,attempts:1,payload:{}}]);
    }
    if(url.pathname==='/rest/v1/rpc/client_delivery_enabled')return Response.json(true);
    if(url.pathname==='/rest/v1/rpc/client_phone_dnc')return Response.json(false);
    if(url.pathname==='/rest/v1/review_requests'&&method==='GET')return Response.json([{
      id:requestId,lead_id:leadId,contact_name:'Alex Customer',contact_phone:'+15125550101',
      contact_email:'wrong@example.test',click_token:'60000000-0000-4000-8000-000000000001',
      clicked_at:scenario.clicked?'2026-10-16T00:00:00Z':null}]);
    if(url.pathname==='/rest/v1/review_requests'&&method==='PATCH'){
      sent.requestStatuses.push(String(body.status||'reminder'));return Response.json([]);
    }
    if(url.pathname==='/rest/v1/leads')return Response.json([{
      id:leadId,phone:scenario.leadPhone,email:'alex@example.test',first_name:'Alex',
      dnc:!!scenario.dnc,source:'form',opt_in_source:'form'}]);
    if(url.pathname==='/rest/v1/mightycall_sms_messages'&&method==='GET')return Response.json([]);
    if(url.pathname==='/rest/v1/mightycall_sms_messages'&&method==='POST')return Response.json([]);
    if(url.pathname==='/v4/auth/token')return Response.json({access_token:'test-mighty-token',expires_in:3600});
    if(url.pathname==='/v4/api/messages/send'){
      sent.sms.push(String(body.message));return Response.json({id:'test-sms-id'});
    }
    if(url.pathname==='/emails'){
      sent.emails.push(String((body.to as string[])[0]));return Response.json({id:'test-email-id'});
    }
    if(url.pathname==='/rest/v1/client_automation_jobs'&&method==='POST'){
      sent.reminders++;return Response.json([]);
    }
    if(url.pathname==='/rest/v1/client_automation_jobs'&&method==='PATCH'){
      sent.jobStatuses.push(String(body.status));if(body.last_error)sent.errors.push(String(body.last_error));return Response.json([]);
    }
    if(url.pathname==='/rest/v1/automation_runs')return Response.json([]);
    throw Error(`Unexpected request ${method} ${url.pathname}`);
  };
  try{
    const {default:handler}=await import('../api/client-delivery-worker.js');
    let status=0;
    await handler({method:'GET',headers:{authorization:'Bearer review-worker-test'}} as never,
      {setHeader(){},set statusCode(value:number){status=value},end(){}} as never);
    assert.equal(status,200);
    return sent;
  }finally{
    globalThis.fetch=originalFetch;
    for(const key of envKeys){const value=before[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
}

test('eligible review request sends one SMS and the lead email, then schedules a reminder',async()=>{
  const result=await runScenario({kind:'review_request',leadPhone:'+15125550101'});
  assert.equal(result.sms.length,1,JSON.stringify(result));
  assert.match(result.sms[0]!,/Reply STOP to opt out/);
  assert.match(result.sms[0]!,/\/r\/60000000-0000-4000-8000-000000000001/);
  assert.deepEqual(result.emails,['alex@example.test']);
  assert.equal(result.reminders,1);
  assert.deepEqual(result.requestStatuses,['sent']);
  assert.deepEqual(result.jobStatuses,['sent']);
});

test('changed request phone or opt-out cancels review sends and reminders',async()=>{
  for(const scenario of [
    {kind:'review_request' as const,leadPhone:'+15125550999'},
    {kind:'review_reminder' as const,leadPhone:'+15125550101',dnc:true},
    {kind:'review_reminder' as const,leadPhone:'+15125550101',clicked:true},
  ]){
    const result=await runScenario(scenario);
    assert.deepEqual(result.sms,[]);
    assert.deepEqual(result.emails,[]);
    assert.equal(result.reminders,0);
    assert.deepEqual(result.jobStatuses,['cancelled']);
  }
});

test('unclicked review request gets one reminder without another email',async()=>{
  const result=await runScenario({kind:'review_reminder',leadPhone:'+15125550101'});
  assert.equal(result.sms.length,1);
  assert.match(result.sms[0]!,/Reply STOP to opt out/);
  assert.deepEqual(result.emails,[]);
  assert.equal(result.reminders,0);
  assert.deepEqual(result.requestStatuses,['reminder']);
  assert.deepEqual(result.jobStatuses,['sent']);
});
