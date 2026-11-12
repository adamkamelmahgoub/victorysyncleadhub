import test from 'node:test';
import assert from 'node:assert/strict';
import type {IncomingMessage} from 'node:http';
import {actor,selectedAccount} from '../lib/marketing-routes/marketing.js';
import {mcpPool} from '../lib/mcp-auth.js';
import {signPortalSelection} from '../lib/portal-cookie.js';

test('client owner can view own pages and edit only with the page editing flag',async()=>{
  const userId='20000000-0000-4000-8000-000000000001';
  const accountId='10000000-0000-4000-8000-000000000001';
  const originalFetch=globalThis.fetch,originalQuery=mcpPool.query;
  const oldEnv={url:process.env.SUPABASE_URL,anon:process.env.SUPABASE_ANON_KEY,
    cookie:process.env.PORTAL_COOKIE_SECRET};
  let canAccess=true,canEdit=false,pageAllowed=true,role='client_owner';
  try{
    process.env.SUPABASE_URL='https://supabase.test';
    process.env.SUPABASE_ANON_KEY='test-anon';
    process.env.PORTAL_COOKIE_SECRET='test-secret-that-is-at-least-32-characters';
    mcpPool.query=(async(sql:string)=>{
      if(sql.includes('user_feature_access'))return {rows:[{enabled:true}],rowCount:1};
      if(sql.includes('team_members'))return {rows:[{role,page_permissions:['pages','forms']}],rowCount:1};
      if(sql.includes('public.profiles'))return {rows:[],rowCount:0};
      return {rows:[],rowCount:0};
    }) as typeof mcpPool.query;
    globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
      const path=new URL(String(input)).pathname;
      if(path==='/auth/v1/user')return Response.json({id:userId,email_confirmed_at:'2026-01-01T00:00:00Z'});
      if(path.endsWith('/rpc/portal_page_allowed'))return Response.json(pageAllowed);
      if(path.endsWith('/rpc/can_access_account'))return Response.json(canAccess);
      if(path.endsWith('/rpc/portal_page_edit_allowed'))return Response.json(canEdit);
      throw Error(`Unexpected request ${path} ${init?.method}`);
    }) as typeof fetch;
    const cookie=signPortalSelection({userId,accountId,viewAsClient:false,issuedAt:Date.now()});
    const req={headers:{authorization:'Bearer synthetic-token',cookie:`vs_portal=${cookie}`}} as IncomingMessage;
    const owner=await actor(req,'landing-pages');
    assert.equal(owner.agencyViewAllowed,false);
    assert.equal((await selectedAccount(req,owner.id,owner.agencyViewAllowed,owner.teamRole)).canEdit,false);
    canEdit=true;
    assert.equal((await selectedAccount(req,owner.id,owner.agencyViewAllowed,owner.teamRole)).canEdit,true);
    canAccess=false;
    await assert.rejects(()=>selectedAccount(req,owner.id,owner.agencyViewAllowed,owner.teamRole),/Client account access denied/);
    canAccess=true;pageAllowed=false;
    await assert.rejects(()=>actor(req,'landing-pages'),/access is disabled/);
    role='client_staff';
    await assert.rejects(()=>actor(req,'landing-pages'),/access is disabled|access is disabled for this account/);
  }finally{
    globalThis.fetch=originalFetch;mcpPool.query=originalQuery;
    for(const [key,value] of Object.entries({SUPABASE_URL:oldEnv.url,SUPABASE_ANON_KEY:oldEnv.anon,
      PORTAL_COOKIE_SECRET:oldEnv.cookie})){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
});
