import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import type {IncomingMessage} from 'node:http';
import {readSocialJsonBody} from '../lib/social-request-body.js';
import {isSocialOwner,socialActorOrganizations,SOCIAL_WORKSPACE_ORG_ID,type SocialActor} from '../lib/social-workspace-auth.js';

test('reads campaign action from a raw Vercel request',async()=>{
  const req=Readable.from([JSON.stringify({action:'status',campaign_id:'12345678-1234-1234-1234-123456789abc',status:'active'})]) as IncomingMessage;
  assert.equal((await readSocialJsonBody(req)).campaign_id,'12345678-1234-1234-1234-123456789abc');
});
test('reads campaign action when middleware already populated req.body',async()=>{
  const req=Readable.from([]) as IncomingMessage&{body:unknown};
  req.body={action:'status',campaign_id:'12345678-1234-1234-1234-123456789abc',status:'active'};
  assert.equal((await readSocialJsonBody(req)).campaign_id,'12345678-1234-1234-1234-123456789abc');
});
test('rejects malformed or oversized JSON',async()=>{
  await assert.rejects(readSocialJsonBody(Readable.from(['[]']) as IncomingMessage));
  await assert.rejects(readSocialJsonBody(Readable.from(['{"name":"too long"}']) as IncomingMessage,5));
});
test('internal admin can configure Meta while ordinary members cannot',()=>{
  const base:SocialActor={id:'u',email:'u@example.com',ownerOrganizations:[],memberships:[{id:'m',org_id:SOCIAL_WORKSPACE_ORG_ID,
    role:'admin',status:'active',client_account_id:null,permissions:[]}]};
  assert.equal(isSocialOwner(base,SOCIAL_WORKSPACE_ORG_ID),true);
  assert.deepEqual(socialActorOrganizations(base,'accounts_manage'),[SOCIAL_WORKSPACE_ORG_ID]);
  const member={...base,memberships:[{...base.memberships[0],role:'member'}]};
  assert.equal(isSocialOwner(member,SOCIAL_WORKSPACE_ORG_ID),false);
});
