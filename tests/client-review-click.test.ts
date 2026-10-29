import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import handler from '../api/client-review-click.js';

test('review redirect accepts only UUID tokens and tracks a click before redirecting', async () => {
  const originalFetch=globalThis.fetch;
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_KEY='test-key';
  const calls:string[]=[];
  globalThis.fetch=async(input,init)=>{
    calls.push(`${init?.method||'GET'} ${String(input)}`);
    return calls.length===1?Response.json([{id:'11111111-1111-4111-8111-111111111111',clicked_at:null,
      sub_accounts:{google_review_link:'https://g.page/r/example/review'}}]):new Response(null,{status:204});
  };
  const headers=new Map<string,string>();let body='';
  const response={statusCode:200,setHeader:(key:string,value:string)=>headers.set(key,value),end:(value?:string)=>{body=value||''}} as unknown as ServerResponse;
  try {
    await handler({method:'GET',url:'/r/not-a-token'} as IncomingMessage,response);
    assert.equal(response.statusCode,404);assert.equal(calls.length,0);
    await handler({method:'GET',url:'/r/22222222-2222-4222-8222-222222222222'} as IncomingMessage,response);
    assert.equal(response.statusCode,302);assert.equal(headers.get('location'),'https://g.page/r/example/review');
    assert.equal(calls.length,2);assert.match(calls[1],/^PATCH /);assert.equal(body,'');
  } finally {globalThis.fetch=originalFetch;process.env.SUPABASE_URL=oldUrl;process.env.SUPABASE_SERVICE_KEY=oldKey;}
});
