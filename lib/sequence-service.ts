import {EmailInputError,encryptCredentials,keyring,plainText,safeEqual} from './email-security.js';
import type {EmailContext,EmailReply,EmailRpc} from './email-service.js';
import type {DeliveryReport} from './delivery-report.js';

export type InboundMessage={id:string;from:string;subject:string;text:string;receivedAt:string;headers:Record<string,string>;deliveryReport?:DeliveryReport};
export type InboxBatch={messages:InboundMessage[];cursor:Record<string,unknown>;caughtUp:boolean};
export interface InboxAdapter {poll(mailbox:Record<string,any>):Promise<InboxBatch>}
export type InboxFactory=(mailbox:Record<string,any>)=>InboxAdapter;
export const isSequenceEndpoint=(path:string)=>/^\/sequences(?:\/|$)/.test(path)||/^\/email\/(inboxes|poll)(?:\/|$)/.test(path);
export function inboxPollingError(error:unknown) {
 const e=error as {authenticationFailed?:boolean;responseStatus?:string;code?:string;message?:string};
 if(e?.authenticationFailed||e?.responseStatus==='NO')return 'IMAP login was rejected. SMTP is connected, but inbox access is not. In Zoho Mail, enable IMAP Access for this mailbox and use an application-specific password, then click Check inbox.';
 if(['ETIMEDOUT','ESOCKETTIMEDOUT'].includes(String(e?.code)))return 'The IMAP server timed out. Check the inbox host and try again.';
 if(['ECONNREFUSED','ENOTFOUND','EAI_AGAIN'].includes(String(e?.code)))return 'The IMAP server could not be reached. Check the receiving host and internet DNS, then retry.';
 if(/certificate|tls/i.test(String(e?.message??'')))return 'The IMAP server failed secure TLS verification. Check the receiving host supplied by your provider.';
 return 'Reply polling failed. Check the IMAP host, enable inbox access with your provider, and use an application-specific password.';
}

// Only explicit ISO dates or English month/day dates following a return phrase are parsed.
// Ambiguous locale dates intentionally use the seven-day fallback.
export function classifyReply(message:InboundMessage,now=new Date(),timezone='UTC') {
 const h=Object.fromEntries(Object.entries(message.headers).map(([k,v])=>[k.toLowerCase(),v]));
 const auto=/out[ -]of[ -]office|automatic reply|auto[ -]?reply|on vacation/i.test(message.subject)||/^auto-replied$/i.test(h['auto-submitted']??'')||!!h['x-autoreply']||!!h['x-autorespond'];
 if(!auto)return {auto:false,returnAt:null};
 const phrase=message.text.match(/(?:return(?:ing)?|back|until|through|resume)[^\n.!?]{0,60}/i)?.[0]??'';
 const iso=phrase.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
 const named=phrase.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?/i);
 let parts:number[]|null=iso?[Number(iso[1]),Number(iso[2]),Number(iso[3])]:null;
 if(named)parts=[Number(named[3]??now.getUTCFullYear()),['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(named[1].toLowerCase())+1,Number(named[2])];
 let date:Date|null=null;
 if(parts){
  const [year,month,day]=parts;const calendar=new Date(Date.UTC(year,month-1,day));
  if(calendar.getUTCFullYear()===year&&calendar.getUTCMonth()===month-1&&calendar.getUTCDate()===day){
   // Resume at 08:00 in the lead's local timezone, including DST offset changes.
   let at=Date.UTC(year,month-1,day,8);
   const format=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
   for(let i=0;i<3;i++){const local=Object.fromEntries(format.formatToParts(at).map(p=>[p.type,p.value]));const asUtc=Date.UTC(+local.year,+local.month-1,+local.day,+local.hour,+local.minute,+local.second);at+=Date.UTC(year,month-1,day,8)-asUtc;}
   date=new Date(at);
  }
 }
 return {auto:true,returnAt:date&&date>now?date.toISOString():new Date(now.getTime()+7*86400000).toISOString()};
}

export class SequenceService {
 constructor(private rpc:EmailRpc,private inboxFactory?:InboxFactory){}
 private admin(action:string,data:Record<string,unknown>={},c?:EmailContext){return this.rpc('outreach_sequence_admin',{p_action:action,p_data:data,p_actor:c?.actor??'system',p_scope:c?.scope??null});}
 async poll(mailboxId?:string) {
  keyring();if(!this.inboxFactory)throw new EmailInputError('Inbox provider is unavailable');
  const mailbox=mailboxId?await this.rpc('outreach_email_smtp_admin',{p_action:'inbox_claim',p_data:{id:mailboxId},p_actor:'system'}):await this.admin('inbox_claim');if(!mailbox)return {polled:0};
  try {
   const batch=await this.inboxFactory(mailbox).poll(mailbox);
   for(const message of batch.messages){
    if(message.deliveryReport){
     if(mailbox.provider==='smtp')await this.rpc('outreach_email_inbox_report',{p_mailbox:String(mailbox.id),p_event:message.id,p_report:message.deliveryReport});
     continue;
    }
    const timezone=await this.admin('reply_timezone',{email:message.from});
    const classification=classifyReply(message,new Date(),timezone??mailbox.mailbox_timezone);
    await this.rpc('outreach_sequence_inbound',{p_mailbox:String(mailbox.id),p_event:message.id,p_from:message.from,p_subject:message.subject,p_body:message.text,p_received:message.receivedAt,p_auto:classification.auto,p_return:classification.returnAt});
   }
   await this.admin('inbox_finish',{id:String(mailbox.id),token:mailbox.inbox_poll_token,ok:true,cursor:batch.cursor,caughtUp:batch.caughtUp});
   return {polled:1,messages:batch.messages.length,caughtUp:batch.caughtUp};
  }catch(error){
   await this.admin('inbox_finish',{id:String(mailbox.id),token:mailbox.inbox_poll_token,ok:false});
   return {polled:0,error:inboxPollingError(error)};
  }
 }
 async handle(c:EmailContext):Promise<EmailReply>{
  const p=c.path,b=c.body??{},ok=(body:any,status=200)=>({status,body});
  if(p==='/email/poll'&&['GET','POST'].includes(c.method)){
   const token=process.env.OUTREACH_WORKER_TOKEN??'';
   if(token.length<32||!safeEqual(c.headers.authorization??'',`Bearer ${token}`))return ok({error:'Unauthorized'},401);
   return ok(await this.poll());
  }
  if(!c.authenticated)return ok({error:'Unauthorized'},401);
  if(p==='/email/inboxes/poll'&&c.method==='POST')return ok(await this.poll());
  if(p==='/email/inboxes'&&c.method==='GET')return ok(await this.admin('inboxes',{},c));
  const inbox=p.match(/^\/email\/inboxes\/([^/]+)$/);
  if(inbox&&c.method==='PUT'){
   if(!['imap','resend','disabled'].includes(b.provider))throw new EmailInputError('Choose IMAP or Resend receiving');
   const m=await this.admin('inbox_secret',{id:inbox[1]},c);if(!m)return ok({error:'Mailbox not found'},404);
   let secret:Record<string,unknown>={};
   if(b.provider==='imap'){
    if(!/^[a-z0-9.-]+$/i.test(b.host??'')||!b.user||!b.password)throw new EmailInputError('IMAP host, username and password are required');
    if(!String(b.folder??'INBOX').trim()||String(b.folder??'INBOX').length>200)throw new EmailInputError('Enter an inbox folder of at most 200 characters');
    secret={host:String(b.host),port:993,user:String(b.user),password:String(b.password),folder:String(b.folder??'INBOX')};
   }else if(b.provider==='resend'){
    if(!b.apiKey)throw new EmailInputError('A Resend receiving API key is required');secret={apiKey:String(b.apiKey)};
   }
   return ok(await this.admin('inbox_configure',{id:inbox[1],provider:b.provider,credentials:b.provider==='disabled'?null:encryptCredentials(secret,m.from_email)},c));
  }
  if(p==='/sequences'){
   if(c.method==='GET')return ok(await this.rpc('outreach_sequence_list',{}));
   if(c.method==='POST'){if(!String(b.name??'').trim())throw new EmailInputError('Name is required');return ok(await this.admin('create',{name:String(b.name).trim()},c),201);}
  }
  const stop=p.match(/^\/sequences\/enrollments\/([^/]+)\/stop$/);
  if(stop&&c.method==='POST')return ok(await this.admin('stop',{id:stop[1]},c));
  const outcome=p.match(/^\/sequences\/enrollments\/([^/]+)\/outcome$/);
  if(outcome&&c.method==='POST'){
   if(!['no_reply','positive_reply','reply','not_interested','hard_bounce','unsubscribed'].includes(String(b.outcome)))throw new EmailInputError('Choose a valid email outcome');
   return ok(await this.rpc('outreach_sequence_manual_outcome',{p_enrollment:outcome[1],p_outcome:String(b.outcome),p_actor:c.actor??'operator',p_scope:c.scope??null}));
  }
  const match=p.match(/^\/sequences\/([^/]+)(?:\/(steps|enroll|enrollments)(?:\/([^/]+))?)?$/);
  if(!match)return ok({error:'Unsupported sequence operation'},405);
  const [,id,operation,stepId]=match;
  if(c.method==='GET'){const seq=await this.admin('get',{id},c);if(!seq)return ok({error:'Sequence not found'},404);return ok(operation==='steps'?seq.steps:operation==='enrollments'?seq.enrollments:seq);}
  if(operation==='enroll'&&c.method==='POST'){
   if(!Array.isArray(b.leadIds)||!b.leadIds.length||b.leadIds.length>100)throw new EmailInputError('Choose 1 to 100 contacts');
   return ok(await this.admin('enroll',{id,leadIds:b.leadIds.map(String)},c),201);
  }
  if(operation==='steps'){
   if(c.method==='DELETE'&&stepId)return ok(await this.admin('step_delete',{id,stepId},c));
   if(!['POST','PUT'].includes(c.method))return ok({error:'Unsupported step operation'},405);
   const channel=b.channel??'email';
   if(!['email','manual_email','call_task','linkedin_task','action_item'].includes(channel)||!Number.isInteger(b.stepNumber)||b.stepNumber<1||!Number.isInteger(b.delayDays)||b.delayDays<0||b.delayDays>365)throw new EmailInputError('Enter a channel, step number and delay of 0 to 365 days');
   const subject=String(b.subject??''),body=String(b.body??'');
   if(channel==='email'){const settings=await this.rpc('outreach_email_admin',{p_action:'dashboard'});plainText(subject,body,settings.settings.direct_link_domains);}
   if(/\{\{(?!(firstName|first_name|lastName|company|city|avg_job_value|missed_calls_per_week|after_hours_coverage|uses_answering_service)\}\})/.test(subject+body))throw new EmailInputError('Unsupported template variable');
   return ok(await this.admin('step_save',{id,stepId,channel,stepNumber:b.stepNumber,delayDays:b.delayDays,subject,body},c));
  }
  if(!operation&&['PUT','PATCH'].includes(c.method)){
   if(b.status!==undefined&&!['draft','active','paused'].includes(b.status))throw new EmailInputError('Invalid sequence status');
   const result=await this.admin('update',{id,...(b.name!==undefined?{name:String(b.name)}:{}),...(b.status!==undefined?{status:b.status}:{})},c);
   if(b.label!==undefined)await this.rpc('outreach_sequence_label',{p_sequence:id,p_label:String(b.label),p_actor:c.actor??'operator'});
   return ok(result);
  }
  if(!operation&&c.method==='DELETE')return ok(await this.rpc('outreach_sequence_archive',{p_sequence:id,p_actor:c.actor??'operator'}));
  return ok({error:'Unsupported sequence operation'},405);
 }
}
