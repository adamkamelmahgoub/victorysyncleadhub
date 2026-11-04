import assert from 'node:assert/strict';
import test from 'node:test';

test('new lead and missed call alerts honor owner preferences and link into the portal',async()=>{
  const account='10000000-0000-4000-8000-000000000001';
  const job='20000000-0000-4000-8000-000000000001';
  const keys=['VERCEL_ENV','CLIENT_DELIVERY_SANDBOX','CLIENT_DELIVERY_WORKER_SECRET','SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','REPORT_FROM_EMAIL','MIGHTYCALL_API_KEY',
    'MIGHTYCALL_SECRET_KEY','PORTAL_BASE_URL'] as const;
  const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const priorFetch=globalThis.fetch;
  Object.assign(process.env,{VERCEL_ENV:'production',CLIENT_DELIVERY_SANDBOX:'0',
    CLIENT_DELIVERY_WORKER_SECRET:'owner-alert-test',SUPABASE_URL:'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY:'service-fixture',RESEND_API_KEY:'resend-fixture',
    REPORT_FROM_EMAIL:'reports@example.test',MIGHTYCALL_API_KEY:'mighty-fixture',
    MIGHTYCALL_SECRET_KEY:'mighty-secret-fixture',PORTAL_BASE_URL:'https://portal.victorysync.com'});
  const emails:string[]=[],texts:string[]=[],statuses:string[]=[];
  let claimed=0,enabled=true;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input)),method=init?.method||'GET';
    const body=typeof init?.body==='string'?JSON.parse(init.body) as Record<string,unknown>:{};
    if(url.pathname==='/rest/v1/mightycall_webhook_inbox')return Response.json([]);
    if(url.pathname==='/rest/v1/sub_accounts')return Response.json(url.searchParams.has('id')?[{
      id:account,name:'Demo Plumbing',owner_email:'owner@example.test',package:'starter',
      mightycall_number:'+15125550100',settings:{notifications:{email:enabled,text:enabled,phone:'+15125550102'}}}]:[]);
    if(url.pathname==='/rest/v1/rpc/client_claim_jobs'){
      if(claimed++>=3)return Response.json([]);
      return Response.json([{id:claimed===1?job:claimed===2?'20000000-0000-4000-8000-000000000002':'20000000-0000-4000-8000-000000000003',
        client_account_id:account,lead_id:null,workflow_id:null,kind:'owner_alert',
        source_id:claimed===1?'form:30000000-0000-4000-8000-000000000001':'call:call-1',
        attempts:1,payload:{}}]);
    }
    if(url.pathname==='/rest/v1/rpc/client_delivery_enabled')return Response.json(true);
    if(url.pathname==='/rest/v1/automation_workflows')return Response.json([]);
    if(url.pathname==='/rest/v1/rpc/client_phone_dnc')return Response.json(false);
    if(url.pathname==='/rest/v1/rpc/client_claim_sms_send')return Response.json(true);
    if(url.pathname==='/rest/v1/rpc/client_mark_sms_send_sent')return Response.json(null);
    if(url.pathname==='/rest/v1/mightycall_sms_messages')return Response.json([]);
    if(url.pathname==='/v4/auth/token')return Response.json({access_token:'mighty-token',expires_in:3600});
    if(url.pathname==='/v4/api/messages/send'){
      texts.push(String(body.message));return Response.json({id:'sms-fixture'});
    }
    if(url.pathname==='/emails'){
      emails.push(String(body.text));return Response.json({id:'email-fixture'});
    }
    if(url.pathname==='/rest/v1/client_automation_jobs'&&method==='PATCH'){
      statuses.push(String(body.status));return Response.json([]);
    }
    if(url.pathname==='/rest/v1/automation_runs')return Response.json([]);
    throw Error(`Unexpected request ${method} ${url.pathname}`);
  };
  try{
    const {default:handler}=await import('../api/client-delivery-worker.js');
    for(let i=0;i<2;i++){
      let status=0;
      await handler({method:'GET',headers:{authorization:'Bearer owner-alert-test'}} as never,
        {setHeader(){},set statusCode(value:number){status=value},end(){}} as never);
      assert.equal(status,200);
    }
    assert.deepEqual(statuses,['sent','sent']);
    assert.equal(emails.length,2);
    assert.equal(texts.length,2);
    assert.match(emails[0],/portal\.victorysync\.com\/client-portal\/leads/);
    assert.match(emails[1],/portal\.victorysync\.com\/client-portal\/calls/);
    assert.ok(texts.every(message=>message.includes('Reply STOP to opt out')));
    enabled=false;
    let disabledStatus=0;
    await handler({method:'GET',headers:{authorization:'Bearer owner-alert-test'}} as never,
      {setHeader(){},set statusCode(value:number){disabledStatus=value},end(){}} as never);
    assert.equal(disabledStatus,200);
    assert.deepEqual(statuses,['sent','sent','sent']);
    assert.equal(emails.length,2);
    assert.equal(texts.length,2);
  }finally{
    globalThis.fetch=priorFetch;
    for(const key of keys){const value=before[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
