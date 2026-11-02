import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {mcpPool} from '../lib/mcp-auth.js';

test('only a signed form success reports a conversion and redirects to the configured URL',async()=>{
  const original=mcpPool.query,secret=process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY='synthetic-form-secret';
  const formId='10000000-0000-4000-8000-000000000001';
  const submissionId='20000000-0000-4000-8000-000000000001';
  const pageId='30000000-0000-4000-8000-000000000001';
  mcpPool.query=(async()=>({rows:[{id:formId,name:'Lead form',slug:'lead',status:'active',
    fields:[{id:'phone',label:'Phone',fieldType:'tel',required:true,order:0,placeholder:null,options:[],mappedLeadField:'phone'}],
    success_message:'Thank you',redirect_url:'https://client.example.com/thanks'}],rowCount:1})) as typeof mcpPool.query;
  try{
    const {default:handler}=await import('../api/marketing.js');
    async function invoke(path:string){
      let content='';const headers:Record<string,string>={};
      const response={statusCode:200,setHeader(key:string,value:string){headers[key]=value},
        end(value?:string){content=value||''}};
      await handler({method:'GET',url:path,headers:{}} as never,response as never);
      return {content,headers};
    }
    const initial=await invoke(`/f/lead?lp=${pageId}`);
    assert.match(initial.content,/landing-form-start/);
    assert.match(initial.headers['content-security-policy'],/script-src 'unsafe-inline'/);
    const signature=createHmac('sha256','synthetic-form-secret')
      .update(`${formId}:${submissionId}:${pageId}`).digest('base64url');
    const signed=await invoke(`/f/lead?submitted=1&sid=${submissionId}&lp=${pageId}&sig=${signature}`);
    assert.match(signed.content,/landing-form-submit/);
    assert.match(signed.content,/client\.example\.com\/thanks/);
    assert.match(signed.headers['content-security-policy'],/script-src 'unsafe-inline'/);
    const forged=await invoke(`/f/lead?submitted=1&sid=${submissionId}&lp=${pageId}&sig=invalid`);
    assert.doesNotMatch(forged.content,/landing-form-submit/);
    assert.doesNotMatch(forged.content,/<script>/);
    assert.doesNotMatch(forged.headers['content-security-policy'],/script-src 'unsafe-inline'/);
  }finally{mcpPool.query=original;if(secret===undefined)delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY=secret;}
});

test('HTML form POST creates one attributed submission and redirects to a signed success page',async()=>{
  const originalQuery=mcpPool.query,originalConnect=mcpPool.connect,secret=process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY='synthetic-form-secret';
  const formId='10000000-0000-4000-8000-000000000001';
  const pageId='30000000-0000-4000-8000-000000000001';
  const accountId='40000000-0000-4000-8000-000000000001';
  const form={id:formId,name:'Lead form',slug:'lead',status:'active',client_account_id:accountId,
    fields:[{id:'phone',label:'Phone',fieldType:'tel',required:true,order:0,placeholder:null,options:[],mappedLeadField:'phone'}],
    success_message:'Thank you',redirect_url:null,campaign_id:null};
  const eventParams:unknown[][]=[];
  mcpPool.query=(async()=>({rows:[form],rowCount:1})) as typeof mcpPool.query;
  mcpPool.connect=(async()=>({query:async(sql:string,params?:unknown[])=>{
    if(sql.includes('form_rate_limits'))return {rows:[{attempts:1}],rowCount:1};
    if(sql.includes('select id from public.form_submissions'))return {rows:[],rowCount:0};
    if(sql.includes('select id from public.leads'))return {rows:[],rowCount:0};
    if(sql.includes('insert into public.leads'))return {rows:[{id:'50000000-0000-4000-8000-000000000001'}],rowCount:1};
    if(sql.includes('select variant_of from public.landing_pages'))return {rows:[{variant_of:'60000000-0000-4000-8000-000000000001'}],rowCount:1};
    if(sql.includes('insert into public.form_submissions'))return {rows:[{id:'70000000-0000-4000-8000-000000000001'}],rowCount:1};
    if(sql.includes('insert into public.landing_page_events'))eventParams.push(params||[]);
    return {rows:[],rowCount:0};
  },release(){}})) as typeof mcpPool.connect;
  try{
    const {default:handler}=await import('../api/marketing.js');
    let content='';const headers:Record<string,string>={};
    const response={statusCode:200,setHeader(key:string,value:string){headers[key]=value},
      end(value?:string){content=value||''}};
    const request=Object.assign(Readable.from([new URLSearchParams({field_phone:'5125550100',
      landing_page_id:pageId,submission_key:'unique-1',utm_source:'google'}).toString()]),
      {method:'POST',url:'/f/lead',headers:{'content-type':'application/x-www-form-urlencoded'},
        socket:{remoteAddress:'127.0.0.1'}});
    await handler(request as never,response as never);
    assert.equal(response.statusCode,303);
    assert.equal(content,'');
    const success=new URL(headers.location,'https://example.test');
    assert.equal(success.searchParams.get('lp'),pageId);
    assert.equal(success.searchParams.get('utm_source'),'google');
    assert.ok(success.searchParams.get('sig'));
    assert.equal(eventParams.length,1);
    assert.equal(eventParams[0][2],pageId);
    assert.equal(eventParams[0][3],accountId);
    assert.deepEqual(JSON.parse(String(eventParams[0][4])),{utm_source:'google'});
  }finally{
    mcpPool.query=originalQuery;mcpPool.connect=originalConnect;
    if(secret===undefined)delete process.env.TOKEN_ENCRYPTION_KEY;else process.env.TOKEN_ENCRYPTION_KEY=secret;
  }
});
