import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simpleParser} from '../artifacts/api-server/node_modules/mailparser/index.js';
import {deliveryReport} from '../lib/delivery-report.js';
import {SequenceService,inboxPollingError} from '../lib/sequence-service.js';
import {EmailService} from '../lib/email-service.js';
import {SmtpRecipientRejected} from '../lib/email-providers.js';

test('real multipart DSN parses machine status and the original message ID, not quoted reply text',async()=>{
 const source=['From: Mail Delivery System <mailer-daemon@zoho.com>','Subject: Delivery failed','MIME-Version: 1.0','Content-Type: multipart/report; report-type=delivery-status; boundary="boundary"','','--boundary','Content-Type: text/plain','','Delivery failed.','--boundary','Content-Type: message/delivery-status','','Reporting-MTA: dns; mx.zoho.com','','Final-Recipient: rfc822; lead@example.test','Action: failed','Status: 5.1.1','','--boundary','Content-Type: message/rfc822','','From: adam@victorysync.com','To: lead@example.test','Message-ID: <job-id@victorysync.com>','Subject: Hello','','Original message','--boundary--'].join('\r\n');
 const parsed=await simpleParser(source,{keepDeliveryStatus:true});const report=deliveryReport(parsed.attachments,true);
 assert.deepEqual(report,{messageIds:['<job-id@victorysync.com>'],recipients:[{recipient:'lead@example.test',action:'failed',status:'5.1.1'}]});
 assert.equal(deliveryReport([],false),undefined);assert.throws(()=>deliveryReport([],true),/incomplete/);
});
test('IMAP failures explain authentication, timeout and host problems without exposing provider diagnostics',()=>{
 assert.match(inboxPollingError({authenticationFailed:true,responseStatus:'NO',message:'secret diagnostic'}),/IMAP login was rejected/);
 assert.match(inboxPollingError({code:'ETIMEDOUT'}),/timed out/);
 assert.match(inboxPollingError({code:'ENOTFOUND'}),/could not be reached/);
 assert.doesNotMatch(inboxPollingError(new Error('password=secret diagnostic')),/password=secret/);
});
test('DSNs are processed as delivery events and never as human replies; failed persistence leaves cursor unchanged',async()=>{
 process.env.OUTREACH_ENCRYPTION_KEY_ID='test';process.env.OUTREACH_ENCRYPTION_KEYS=JSON.stringify({test:Buffer.alloc(32,7).toString('base64')});
 const calls:string[]=[];const finishes:any[]=[];let fail=false;
 const rpc=async(name:string,args:any)=>{calls.push(name);if(name==='outreach_email_inbox_report'){if(fail)throw new Error('DB unavailable');return {};}
  if(args.p_action==='inbox_claim')return {id:1,from_email:'sender@test.com',provider:'smtp',inbox_poll_token:'token'};
  if(args.p_action==='inbox_finish')finishes.push(args.p_data);return null;};
 const service=new SequenceService(rpc,()=>({poll:async()=>({caughtUp:true,cursor:{uid:1},messages:[{id:'dsn',from:'mailer-daemon@zoho.com',subject:'Failed',text:'Failed',receivedAt:new Date().toISOString(),headers:{},deliveryReport:{messageIds:['<id@sender.test>'],recipients:[{recipient:'lead@test.com',action:'failed',status:'5.1.1'}]}}]})}));
 await service.poll();assert.ok(calls.includes('outreach_email_inbox_report'));assert.ok(!calls.includes('outreach_sequence_inbound'));assert.equal(finishes[0].ok,true);
 fail=true;await service.poll();assert.equal(finishes[1].ok,false);assert.equal(finishes[1].cursor,undefined);
});
test('SMTP inbox mode enables only after a successful inbox scan, without a webhook secret',async()=>{
 const saved=process.env.OUTREACH_EVENT_SECRET;delete process.env.OUTREACH_EVENT_SECRET;let caughtUp=true,enabled=false;
 const mailbox={id:1,provider:'smtp',smtp_monitoring_mode:'inbox',from_email:'adam@example.test',inbox_poll_token:'token'};
 const rpc=async(_name:string,args:any)=>{if(args.p_action==='mailbox_secret'||args.p_action==='inbox_claim')return mailbox;if(args.p_action==='mailbox_update')enabled=true;return {};};
 const service=new EmailService(rpc,()=>({send:async()=>({messageId:'unused'})}),undefined,undefined,undefined,()=>({poll:async()=>({messages:[],cursor:{uid:1},caughtUp})}));
 const request={path:'/email/mailboxes/1',method:'PATCH',body:{engineEnabled:true},raw:'',headers:{},authenticated:true};
 try{await service.handle(request);assert.equal(enabled,true);caughtUp=false;enabled=false;await assert.rejects(()=>service.handle(request),/receiving inbox/);assert.equal(enabled,false);}finally{if(saved!==undefined)process.env.OUTREACH_EVENT_SECRET=saved;}
});
test('SMTP-only mode can be selected and enabled without an inbox check',async()=>{
 const saved=process.env.OUTREACH_EVENT_SECRET;delete process.env.OUTREACH_EVENT_SECRET;const actions:string[]=[];
 const mailbox={id:1,provider:'smtp',smtp_monitoring_mode:'manual',from_email:'adam@example.test'};
 const rpc=async(name:string,args:any)=>{actions.push(name);if(args.p_action==='mailbox_secret')return mailbox;return {mode:'manual'};};
 const service=new EmailService(rpc,()=>({send:async()=>({messageId:'unused'})}));
 try{
  const selected=await service.handle({path:'/email/mailboxes/1/smtp-only',method:'POST',body:{},raw:'',headers:{},authenticated:true});assert.equal(selected.status,200);assert.ok(actions.includes('outreach_email_manual_mode'));
  await service.handle({path:'/email/mailboxes/1',method:'PATCH',body:{engineEnabled:true},raw:'',headers:{},authenticated:true});
 }finally{if(saved!==undefined)process.env.OUTREACH_EVENT_SECRET=saved;}
});
test('Inbox conversation reads real outreach jobs and queues through the selected mailbox',async()=>{
 const calls:Array<{name:string;args:any}>=[];const rpc=async(name:string,args:any)=>{calls.push({name,args});if(name==='outreach_email_conversation')return [{id:'job',status:'sent'}];if(name==='outreach_email_admin')return {settings:{direct_link_domains:[]}};if(name==='outreach_email_enqueue')return {id:'queued',not_before:'2026-09-14T12:00:00Z'};return null;};
 const service=new EmailService(rpc,()=>({send:async()=>({messageId:'unused'})}),undefined,async()=>new Response(null,{status:200}));
 const base={raw:'',headers:{},authenticated:true,actor:'operator'};
 const thread=await service.handle({...base,path:'/email/conversation/lead-1',method:'GET',body:{}});assert.equal(thread.body[0].status,'sent');
 const queued=await service.handle({...base,path:'/email/send',method:'POST',body:{leadId:'lead-1',mailboxId:'mailbox-1',subject:'Hello',body:'Plain text'}});assert.equal(queued.status,202);assert.ok(calls.some(c=>c.name==='outreach_email_enqueue_manual'&&c.args.p_mailbox==='mailbox-1'));
});
test('sent history and campaign launch use scoped outreach RPCs',async()=>{
 const calls:Array<{name:string;args:any}>=[];const rpc=async(name:string,args:any)=>{calls.push({name,args});return name==='outreach_sent_emails'?{items:[],total:0}:{campaignId:'campaign-1',queued:2,skipped:1,alreadyQueued:0};};
 const service=new EmailService(rpc,()=>({send:async()=>({messageId:'unused'})}));const base={raw:'',headers:{},authenticated:true,actor:'operator-1',scope:'account-1'};
 const sent=await service.handle({...base,path:'/email/sent',method:'GET',body:{query:'roof',limit:'50',offset:'0'}});assert.equal(sent.body.total,0);assert.ok(calls.some(c=>c.name==='outreach_sent_emails'&&c.args.p_scope==='account-1'&&c.args.p_query==='roof'));
 const launch=await service.handle({...base,path:'/email/campaigns/campaign-1/launch',method:'POST',body:{}});assert.equal(launch.body.queued,2);assert.ok(calls.some(c=>c.name==='outreach_campaign_launch'&&c.args.p_actor==='operator-1'&&c.args.p_campaign==='campaign-1'));
});
test('known SMTP recipient rejection records a hard bounce instead of ambiguous delivery',async()=>{
 process.env.OUTREACH_EMAIL_ENABLED='true';process.env.OUTREACH_PUBLIC_URL='https://portal.example.test';const actions:Array<{name:string;args:any}>=[];
 const service=new EmailService(async(name,args)=>{actions.push({name,args});if(name==='outreach_email_claim')return {job:{id:'job-id',subject:'Hello',body:'Hello',claim_token:'claim',to_email:'lead@example.test',unsubscribe_token:'token'},mailbox:{from_email:'sender@example.test',from_name:'Sender'},domain:'example.test',directLinkDomains:[]};if(name==='outreach_email_dispatch_check')return true;return null;},()=>({send:async()=>{throw new SmtpRecipientRejected();}}),undefined,undefined,async()=>{});
 const result=await service.process();assert.equal(result.state,'failed');assert.ok(actions.some(c=>c.name==='outreach_email_event'&&c.args.p_type==='hard_bounce'));
 process.env.OUTREACH_EMAIL_ENABLED='false';
});
test('saved mailbox signature is inserted above a final labeled unsubscribe hyperlink',async()=>{
 process.env.OUTREACH_EMAIL_ENABLED='true';process.env.OUTREACH_PUBLIC_URL='https://portal.example.test';let text='',html='';
 const service=new EmailService(async(name)=>{if(name==='outreach_email_claim')return {job:{id:'job-id',subject:'Hello',body:'Message & details',claim_token:'claim',to_email:'lead@example.test',unsubscribe_token:'token'},mailbox:{from_email:'sender@example.test',from_name:'Sender',signature:'Adam\nVictory Sync'},domain:'example.test',directLinkDomains:[]};if(name==='outreach_email_dispatch_check')return true;return null;},()=>({send:async message=>{text=message.text;html=message.html??'';return {messageId:'sent'};}}),undefined,undefined,async()=>{});
 await service.process();assert.match(text.split('\n').at(-1)??'',/^Unsubscribe: https:/);assert.match(html,/<a href="https:\/\/portal\.example\.test\/api\/email\/unsubscribe\?token=token">Unsubscribe<\/a><\/div>$/);assert.match(html,/Message &amp; details/);assert.doesNotMatch(html,/>https:\/\//);
 process.env.OUTREACH_EMAIL_ENABLED='false';
});
