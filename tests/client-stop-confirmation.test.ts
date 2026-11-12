import test from 'node:test';
import assert from 'node:assert/strict';

const accountId='10000000-0000-4000-8000-000000000001';
const jobId='30000000-0000-4000-8000-000000000001';

async function run(kind:'stop_confirmation'|'lead_followup',claimDenied=false){
  const keys=['VERCEL_ENV','CLIENT_DELIVERY_SANDBOX','CLIENT_DELIVERY_WORKER_SECRET','SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY','MIGHTYCALL_API_KEY','MIGHTYCALL_SECRET_KEY'] as const;
  const prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const fetchBefore=globalThis.fetch;
  Object.assign(process.env,{VERCEL_ENV:'production',CLIENT_DELIVERY_SANDBOX:'0',
    CLIENT_DELIVERY_WORKER_SECRET:'stop-test',SUPABASE_URL:'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY:'test-service',MIGHTYCALL_API_KEY:'test-api',MIGHTYCALL_SECRET_KEY:'test-user'});
  const result={sms:[] as string[],status:'',featureChecks:0,claims:0,markedSent:0,error:''};
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));const method=init?.method||'GET';
    const body=init?.body&&!(init.body instanceof URLSearchParams)
      ?JSON.parse(String(init.body)) as Record<string,unknown>:{};
    if(url.pathname==='/rest/v1/mightycall_webhook_inbox')return Response.json([]);
    if(url.pathname==='/rest/v1/sub_accounts')return Response.json(url.searchParams.has('id')?[{
      id:accountId,name:'Demo Plumbing',owner_email:'owner@example.test',
      mightycall_number:'+15125550100',settings:{}}]:[]);
    if(url.pathname==='/rest/v1/rpc/client_claim_jobs')return Response.json([{
      id:jobId,client_account_id:accountId,lead_id:null,workflow_id:null,kind,
      source_id:'sms:source',attempts:1,payload:{phone:'+15125550101'}}]);
    if(url.pathname==='/rest/v1/rpc/client_delivery_enabled'){
      result.featureChecks++;return Response.json(false);
    }
    if(url.pathname==='/rest/v1/rpc/client_claim_stop_confirmation'){
      result.claims++;return Response.json(!claimDenied);
    }
    if(url.pathname==='/rest/v1/rpc/client_mark_stop_confirmation_sent'){
      result.markedSent++;return Response.json(null);
    }
    if(url.pathname==='/rest/v1/automation_workflows')return Response.json([]);
    if(url.pathname==='/rest/v1/automation_runs')return Response.json([]);
    if(url.pathname==='/rest/v1/mightycall_sms_messages'&&method==='GET')return Response.json([]);
    if(url.pathname==='/rest/v1/mightycall_sms_messages'&&method==='POST')return Response.json([]);
    if(url.pathname==='/v4/auth/token')return Response.json({access_token:'test-token',expires_in:3600});
    if(url.pathname==='/v4/api/messages/send'){
      result.sms.push(String(body.message));return Response.json({id:'sms-1'});
    }
    if(url.pathname==='/rest/v1/client_automation_jobs'&&method==='PATCH'){
      result.status=String(body.status);result.error=String(body.last_error||'');return Response.json([]);
    }
    throw Error(`Unexpected request ${method} ${url.pathname}`);
  };
  try{
    const {default:handler}=await import('../api/client-delivery-worker.js');
    let status=0;
    await handler({method:'GET',headers:{authorization:'Bearer stop-test'}} as never,
      {setHeader(){},set statusCode(value:number){status=value},end(){}} as never);
    assert.equal(status,200);return result;
  }finally{
    globalThis.fetch=fetchBefore;
    for(const key of keys){const value=prior[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
}

test('STOP confirmation sends once even if delivery automation is off',async()=>{
  const result=await run('stop_confirmation');
  assert.equal(result.status,'sent');
  assert.deepEqual(result.sms,['You are opted out and will not receive further automated texts.']);
  assert.equal(result.featureChecks,0);
  assert.equal(result.claims,1);
  assert.equal(result.markedSent,1);
});

test('uncertain STOP confirmation claim blocks a duplicate provider send',async()=>{
  const result=await run('stop_confirmation',true);
  assert.equal(result.status,'failed');
  assert.match(result.error,/claim already exists/);
  assert.deepEqual(result.sms,[]);
  assert.equal(result.claims,1);
  assert.equal(result.markedSent,0);
});

test('ordinary follow-up stays canceled when delivery automation is off',async()=>{
  const result=await run('lead_followup');
  assert.equal(result.status,'cancelled');
  assert.deepEqual(result.sms,[]);
  assert.equal(result.featureChecks,1);
});
