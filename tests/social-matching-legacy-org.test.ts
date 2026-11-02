import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {mcpPool} from '../lib/mcp-auth.js';
import {matchSocialLead} from '../lib/social-matching.js';
import {SOCIAL_WORKSPACE_ORG_ID} from '../lib/social-workspace-auth.js';

test('matches an agency prospect with null organization by provider ID and profile URL',async()=>{
  const db=new PGlite();
  const original=mcpPool.query;
  const lead='11111111-1111-4111-8111-111111111111';
  try{
    await db.exec(`create table leads(id uuid primary key,organization_id uuid,owner_rep_id uuid,first_name text,last_name text,company text);
      create table social_profiles(entity_id uuid,organization_id uuid,platform text,entity_type text,
        platform_user_id text,normalized_handle text,profile_url text,review_status text not null default 'pending');
      insert into leads values('${lead}',null,null,'Demo','Lead','Fixture');
      insert into social_profiles values('${lead}','${SOCIAL_WORKSPACE_ORG_ID}','instagram','lead',
        'provider-123','demo_lead','https://instagram.com/demo_lead/');`);
    mcpPool.query=((sql:string,values?:unknown[])=>db.query(sql,values)) as typeof mcpPool.query;
    const base={organizationId:SOCIAL_WORKSPACE_ORG_ID,repUserId:null,platform:'instagram' as const};
    const provider=await matchSocialLead({...base,providerUserId:'provider-123'});
    assert.equal(provider.leadId,lead);assert.equal(provider.method,'provider_id');
    const url=await matchSocialLead({...base,providerUserId:'other',profileUrl:'https://instagram.com/demo_lead/?ref=profile'});
    assert.equal(url.leadId,lead);assert.equal(url.method,'profile_url');
    const handle=await matchSocialLead({...base,providerUserId:'other',publicIdentifier:'@demo_lead'});
    assert.equal(handle.leadId,lead);assert.equal(handle.method,'handle');
    await db.exec(`update social_profiles set review_status='rejected' where entity_id='${lead}'`);
    for(const input of [
      {providerUserId:'provider-123'},
      {providerUserId:'other',publicIdentifier:'@demo_lead'},
      {providerUserId:'other',profileUrl:'https://instagram.com/demo_lead/'},
    ]){
      const rejected=await matchSocialLead({...base,...input});
      assert.equal(rejected.status,'unmatched');
      assert.equal(rejected.leadId,null);
    }
  }finally{mcpPool.query=original;await db.close();}
});
