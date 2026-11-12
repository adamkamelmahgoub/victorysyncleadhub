import assert from 'node:assert/strict';
import test from 'node:test';

const accountId='10000000-0000-4000-8000-000000000001';
const reportId='20000000-0000-4000-8000-000000000001';
const jobId='30000000-0000-4000-8000-000000000001';

test('report worker archives the approved PDF and emails only active recipients once',async()=>{
  const keys=['VERCEL_ENV','CLIENT_DELIVERY_SANDBOX','CLIENT_DELIVERY_WORKER_SECRET','SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','REPORT_FROM_EMAIL'] as const;
  const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const previousFetch=globalThis.fetch;
  Object.assign(process.env,{VERCEL_ENV:'production',CLIENT_DELIVERY_SANDBOX:'0',
    CLIENT_DELIVERY_WORKER_SECRET:'report-worker-test',SUPABASE_URL:'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY:'service-fixture',RESEND_API_KEY:'resend-fixture',
    REPORT_FROM_EMAIL:'reports@example.test'});
  let claimed=false,metricRange:Record<string,unknown>|null=null,recipientQuery='',reportPatch:Record<string,unknown>|null=null;
  const emails:Array<{to:string;key:string;body:string}>=[];
  let uploads=0,jobStatus='';
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input)),method=init?.method||'GET';
    const body=init?.body&&typeof init.body==='string'?JSON.parse(init.body) as Record<string,unknown>:{};
    if(url.pathname==='/rest/v1/mightycall_webhook_inbox')return Response.json([]);
    if(url.pathname==='/rest/v1/sub_accounts')return Response.json(url.searchParams.has('id')?[{
      id:accountId,name:'Demo Plumbing',owner_email:'owner@example.test',package:'starter',
      brand:{primary:'#245eea'},settings:{}}]:[]);
    if(url.pathname==='/rest/v1/rpc/client_claim_jobs'){
      if(claimed)return Response.json([]);
      claimed=true;
      return Response.json([{id:jobId,client_account_id:accountId,lead_id:null,
        workflow_id:'40000000-0000-4000-8000-000000000001',kind:'report_send',
        source_id:`report:${reportId}`,attempts:1,payload:{}}]);
    }
    if(url.pathname==='/rest/v1/rpc/client_delivery_enabled')return Response.json(true);
    if(url.pathname==='/rest/v1/report_sends'&&method==='GET')return Response.json([{
      id:reportId,type:'monthly',period_start:'2026-10-01',period_end:'2026-10-31',
      work_done:'Updated campaign pages.',whats_next:'Review lead quality.',status:'queued'}]);
    if(url.pathname==='/rest/v1/report_sends'&&method==='PATCH'){
      reportPatch=body;return Response.json([]);
    }
    if(url.pathname==='/rest/v1/rpc/client_dashboard_metric_values'){
      metricRange=body;return Response.json({newLeads:10,bookedJobs:2,answeredCalls:8,
        missedCallsRecovered:1,reviewsReceived:2,averageRating:4.5,adSpendCents:50000});
    }
    if(url.pathname==='/rest/v1/report_recipients'){
      recipientQuery=url.search;return Response.json([
        {email:'OWNER@EXAMPLE.TEST'},{email:'office@example.test'}]);
    }
    if(url.pathname.startsWith('/storage/v1/object/client-reports/')){
      uploads++;assert.equal(init?.headers&&'content-type'in init.headers?init.headers['content-type']:null,'application/pdf');
      return Response.json({Key:'stored'});
    }
    if(url.pathname.startsWith('/storage/v1/object/sign/client-reports/'))
      return Response.json({signedURL:'/object/sign/client-reports/report.pdf?token=fixture'});
    if(url.pathname==='/emails'){
      emails.push({to:String((body.to as string[])[0]),key:String((init?.headers as Record<string,string>)['Idempotency-Key']),
        body:String(body.text)});return Response.json({id:'email-fixture'});
    }
    if(url.pathname==='/rest/v1/client_automation_jobs'&&method==='PATCH'){
      jobStatus=String(body.status);return Response.json([]);
    }
    if(url.pathname==='/rest/v1/automation_runs')return Response.json([]);
    throw Error(`Unexpected request ${method} ${url.pathname}`);
  };
  try{
    const {default:handler}=await import('../api/client-delivery-worker.js');
    let status=0;
    await handler({method:'GET',headers:{authorization:'Bearer report-worker-test'}} as never,
      {setHeader(){},set statusCode(value:number){status=value},end(){}} as never);
    assert.equal(status,200);
    assert.deepEqual(metricRange,{p_account:accountId,p_start:'2026-10-01T00:00:00.000Z',p_end:'2026-11-01T00:00:00.000Z'});
    assert.match(recipientQuery,/active=eq.true/);
    assert.deepEqual(emails.map(item=>item.to),['owner@example.test','office@example.test']);
    assert.ok(emails.every(item=>item.key.startsWith(jobId)&&item.body.includes('Updated campaign pages.')));
    assert.equal(new Set(emails.map(item=>item.key)).size,2);
    assert.equal(uploads,1);
    assert.equal(reportPatch?.status,'sent');
    assert.equal(reportPatch?.pdf_path,`${accountId}/${reportId}.pdf`);
    assert.equal(jobStatus,'sent');
  }finally{
    globalThis.fetch=previousFetch;
    for(const key of keys){const value=before[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
