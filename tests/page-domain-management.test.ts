import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mcpPool} from '../lib/mcp-auth.js';
import {getPageDomainStatus,pageDomainSchema,registerPageDomain,verifyPageDomain} from '../lib/page-domains.js';

test('client domains are normalized and workspace hosts are rejected',()=>{
  assert.deepEqual(pageDomainSchema.parse({domain:'  Offers.Example.COM  '}),{domain:'offers.example.com'});
  for(const domain of ['https://example.com','example.com/path','portal.victorysync.com',
    'preview.vercel.app','localhost','-bad.example.com'])
    assert.equal(pageDomainSchema.safeParse({domain}).success,false,domain);
});

test('page domain API validates input, checks access, and stores the assigned host',async()=>{
  const originalFetch=globalThis.fetch,originalQuery=mcpPool.query;
  const env=Object.fromEntries(['SUPABASE_URL','SUPABASE_ANON_KEY','VERCEL_API_TOKEN','VERCEL_PROJECT_ID'].map(
    key=>[key,process.env[key]]));
  Object.assign(process.env,{SUPABASE_URL:'https://supabase.example',SUPABASE_ANON_KEY:'anon-test',
    VERCEL_API_TOKEN:'vercel-test',VERCEL_PROJECT_ID:'project-test'});
  const pageId='40000000-0000-4000-8000-000000000001';
  const stored:string[]=[];
  mcpPool.query=(async(sql:string,params?:unknown[])=>{
    if(sql.includes('user_feature_access'))return {rows:[{enabled:true}],rowCount:1};
    if(sql.includes('from public.team_members'))return {rows:[{role:'agency_admin',page_permissions:['pages']}],rowCount:1};
    if(sql.includes('from public.profiles'))return {rows:[],rowCount:0};
    if(sql.includes('select 1 from public.landing_pages where id='))return {rows:[{one:1}],rowCount:1};
    if(sql.includes('select custom_domain,client_account_id'))return {rows:[{custom_domain:null,client_account_id:null}],rowCount:1};
    if(sql.includes('select 1 from public.landing_pages where lower(custom_domain)'))return {rows:[],rowCount:0};
    if(sql.includes('update public.landing_pages set custom_domain')){stored.push(String(params?.[2]));return {rows:[],rowCount:1};}
    return {rows:[],rowCount:0};
  }) as typeof mcpPool.query;
  let providerCalls=0;
  globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    if(url.endsWith('/auth/v1/user'))return Response.json({id:'30000000-0000-4000-8000-000000000001',email_confirmed_at:'2026-01-01'});
    providerCalls++;
    if(init?.method==='GET')return new Response('{}',{status:404});
    return Response.json({name:'offers.example.com',verified:true});
  }) as typeof fetch;
  try{
    const {default:handler}=await import('../api/marketing.js');
    async function invoke(domain:string,authorized=true){
      let content='';const response={statusCode:200,setHeader(){},end(value?:string){content=value||''}};
      const request=Object.assign(Readable.from([JSON.stringify({domain})]),{method:'POST',
        url:`/api/landing-pages/${pageId}/domain`,headers:{authorization:authorized?'Bearer test':'',
          'content-type':'application/json'}});
      await handler(request as never,response as never);
      return {status:response.statusCode,body:JSON.parse(content)};
    }
    assert.equal((await invoke('offers.example.com',false)).status,401);
    assert.equal((await invoke('https://offers.example.com')).status,400);
    assert.equal(providerCalls,0);
    const result=await invoke('Offers.Example.COM');
    assert.equal(result.status,200);
    assert.deepEqual(stored,['offers.example.com']);
    assert.equal(providerCalls,2);
  }finally{
    mcpPool.query=originalQuery;globalThis.fetch=originalFetch;
    for(const [key,value] of Object.entries(env))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});

test('domain registration uses Vercel project API and returns verification records',async()=>{
  const originalFetch=globalThis.fetch;
  const token=process.env.VERCEL_API_TOKEN,project=process.env.VERCEL_PROJECT_ID,team=process.env.VERCEL_TEAM_ID;
  process.env.VERCEL_API_TOKEN='test-token';process.env.VERCEL_PROJECT_ID='test-project';process.env.VERCEL_TEAM_ID='test-team';
  const calls:Array<{url:string;method:string;body?:string}>=[];
  let getCount=0;
  globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input),method=init?.method||'GET';
    calls.push({url,method,body:init?.body as string|undefined});
    if(method==='GET'&&url.includes('/domains/offers.example.com')){
      getCount++;
      return getCount===1?new Response('{}',{status:404}):Response.json({name:'offers.example.com',verified:true});
    }
    if(method==='POST'&&url.includes('/v10/'))return Response.json({name:'offers.example.com',verified:false,
      verification:[{type:'TXT',domain:'_vercel.example.com',value:'verify-value'}]});
    return Response.json({name:'offers.example.com',verified:true});
  }) as typeof fetch;
  try{
    const connected=await registerPageDomain('offers.example.com');
    assert.equal(connected.verified,false);
    assert.equal(connected.verification[0].value,'verify-value');
    assert.match(calls[0].url,/\/v9\/projects\/test-project\/domains\/offers\.example\.com/);
    assert.match(calls[1].url,/\/v10\/projects\/test-project\/domains/);
    assert.deepEqual(JSON.parse(calls[1].body||'{}'),{name:'offers.example.com'});
    const verified=await verifyPageDomain('offers.example.com');
    assert.equal(verified.verified,true);
    assert.match(calls[2].url,/\/v9\/projects\/test-project\/domains\/offers\.example\.com\/verify/);
    const existing=await getPageDomainStatus('offers.example.com');
    assert.equal(existing?.verified,true);
  }finally{
    globalThis.fetch=originalFetch;
    for(const [key,value] of [['VERCEL_API_TOKEN',token],['VERCEL_PROJECT_ID',project],['VERCEL_TEAM_ID',team]] as const)
      if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
