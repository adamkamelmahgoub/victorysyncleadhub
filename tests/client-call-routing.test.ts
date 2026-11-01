import test from 'node:test';
import assert from 'node:assert/strict';

test('failed call detail storage leaves the webhook available for retry',async()=>{
  const before={VERCEL_ENV:process.env.VERCEL_ENV,CLIENT_DELIVERY_SANDBOX:process.env.CLIENT_DELIVERY_SANDBOX,
    CLIENT_DELIVERY_WORKER_SECRET:process.env.CLIENT_DELIVERY_WORKER_SECRET,
    SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY,
    MIGHTYCALL_API_KEY:process.env.MIGHTYCALL_API_KEY,MIGHTYCALL_SECRET_KEY:process.env.MIGHTYCALL_SECRET_KEY};
  const originalFetch=globalThis.fetch;
  Object.assign(process.env,{VERCEL_ENV:'production',CLIENT_DELIVERY_SANDBOX:'0',
    CLIENT_DELIVERY_WORKER_SECRET:'worker-test-secret',SUPABASE_URL:'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY:'test-service-key',MIGHTYCALL_API_KEY:'test-api-key',
    MIGHTYCALL_SECRET_KEY:'test-user-key'});
  let routed=false,saveAttempts=0,routedPatches=0;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname==='/rest/v1/mightycall_webhook_inbox'&&init?.method==='PATCH'){
      routedPatches++;
      assert.equal(JSON.parse(String(init.body)).client_routed_at!==undefined,true);
      routed=true;return Response.json([]);
    }
    if(url.pathname==='/rest/v1/mightycall_webhook_inbox')return Response.json(routed?[]:[{
      id:'10000000-0000-4000-8000-000000000001',external_call_id:'call-1',
      event_type:'missed',occurred_at:'2026-10-01T12:00:00Z'}]);
    if(url.pathname==='/rest/v1/sub_accounts')return Response.json([{
      id:'20000000-0000-4000-8000-000000000001',name:'Demo Plumbing',owner_email:'owner@example.test',
      mightycall_number:'+15125550100',settings:{}}]);
    if(url.pathname==='/v4/auth/token')return Response.json({access_token:'test-token',expires_in:3600});
    if(url.pathname==='/v4/api/calls/call-1')return Response.json({businessNumber:'+15125550100',
      caller:{phone:'+15125550101'},callStatus:'missed',direction:'incoming',duration:0});
    if(url.pathname==='/rest/v1/leads')return Response.json([]);
    if(url.pathname==='/rest/v1/client_call_details'){
      saveAttempts++;
      return saveAttempts===1?Response.json({message:'temporary failure'},{status:500}):Response.json([]);
    }
    if(url.pathname==='/rest/v1/rpc/client_claim_jobs')return Response.json([]);
    throw Error(`Unexpected network call ${url.pathname}`);
  };
  try{
    const {default:handler}=await import('../api/client-delivery-worker.js');
    const invoke=async()=>{
      let status=0;
      await handler({method:'GET',headers:{authorization:'Bearer worker-test-secret'}} as never,
        {setHeader(){},set statusCode(value:number){status=value},end(){}} as never);
      assert.equal(status,200);
    };
    await invoke();
    assert.equal(routed,false);
    assert.equal(routedPatches,0);
    await invoke();
    assert.equal(routed,true);
    assert.equal(saveAttempts,2);
    assert.equal(routedPatches,1);
  }finally{
    globalThis.fetch=originalFetch;
    for(const [key,value] of Object.entries(before)){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
});
