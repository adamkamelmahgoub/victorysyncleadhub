import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EmailService,isPublicEmailEndpoint} from '../lib/email-service.js';
import {tokenHash,emailOperationError} from '../lib/email-security.js';
const context=(path:string,body:any={},token='test-token')=>({path,method:'POST',body,headers:{authorization:`Bearer ${token}`},raw:'',authenticated:false});
test('setup errors are actionable while unrecognized provider errors stay private',()=>{
 assert.equal(emailOperationError(new Error('Verify DNS and configure encrypted credentials before enabling mailbox')).status,400);
 assert.equal(emailOperationError(new Error('secret provider diagnostic')).error.includes('secret'),false);
});
test('Make endpoints require their own token; connector management is never public',async()=>{
 let touched=false;
 const service=new EmailService(async(_name,args)=>{if(args.p_action==='secret')return tokenHash('test-token');touched=true;return [];},()=>{throw Error('Unexpected send');});
 assert.equal(isPublicEmailEndpoint('/email/settings/make'),false);
 assert.equal(isPublicEmailEndpoint('/email/make/catalog'),true);
 assert.equal((await service.handle(context('/email/make/events/claim',{},'wrong'))).status,401);assert.equal(touched,false);
 assert.equal((await service.handle(context('/email/make/events/claim'))).status,200);assert.equal(touched,true);
 assert.equal((await service.handle(context('/email/settings/make'))).status,401);
});
test('Make uses the checked email queue and passes a stable retry key with explicit mailbox',async()=>{
 let enqueue:any;
 const service=new EmailService(async(name,args)=>{
  if(args.p_action==='secret')return tokenHash('test-token');
  if(args.p_action==='dashboard')return {settings:{direct_link_domains:[]}};
  if(name==='outreach_make_enqueue'){enqueue=args;return {id:'job'};}throw Error(name);
 },()=>{throw Error('Unexpected send');});
 const body={eventKey:'event:lead:step',leadId:'lead',mailboxId:'mailbox',subject:'Hello',body:'Hi there'};
 assert.equal((await service.handle(context('/email/make/queue',body))).status,202);
 assert.equal(enqueue.p_event_key,body.eventKey);assert.equal(enqueue.p_args.p_mailbox,'mailbox');assert.equal(enqueue.p_args.p_actor,'make');
 await assert.rejects(()=>service.handle(context('/email/make/queue',{...body,mailboxId:null})),/Choose a mailbox/);
 await assert.rejects(()=>service.handle(context('/email/make/queue',{...body,eventKey:''})),/eventKey/);
 await assert.rejects(()=>service.handle(context('/email/make/queue',{...body,body:'<b>HTML</b>'})),/plain text/);
});
test('Make templates use the saved mailbox rather than a caller override',async()=>{
 let mailbox='';
 const service=new EmailService(async(name,args)=>{
  if(args.p_action==='secret')return tokenHash('test-token');
  if(args.p_action==='template')return {subject:'Hi',body:'Hello',mailboxId:'saved-mailbox'};
  if(args.p_action==='dashboard')return {settings:{direct_link_domains:[]}};
  if(name==='outreach_make_enqueue'){mailbox=String((args.p_args as any).p_mailbox);return {id:'job'};}throw Error(name);
 },()=>{throw Error('Unexpected send');});
 await service.handle(context('/email/make/queue',{eventKey:'a',leadId:'l',workflowId:'w',stepIndex:0,mailboxId:'override'}));
 assert.equal(mailbox,'saved-mailbox');
});
