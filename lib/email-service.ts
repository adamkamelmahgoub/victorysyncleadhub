import {randomInt,randomBytes} from 'node:crypto';
import {resolveTxt} from 'node:dns/promises';
import {EmailInputError,keyring,encryptCredentials,decryptCredentials,publicEmailUrl,plainText,checkDirectLinks,unsubscribeToken,tokenHash,safeEqual,verifyEventSignature,verifyResendSignature} from './email-security.js';
import {ZeroBounceVerifier,SmtpRecipientRejected,type VerificationProvider,type EmailTransport,type OutboundMessage} from './email-providers.js';
import {SequenceService,isSequenceEndpoint,type InboxFactory} from './sequence-service.js';
export type EmailRpc=(name:string,data:Record<string,unknown>)=>Promise<any>;
export type EmailContext={path:string;method:string;body:any;raw:string;headers:Record<string,string>;actor?:string;scope?:string|null;authenticated:boolean};
export type EmailReply={status:number;body:any;text?:boolean};
export const isPublicEmailEndpoint=(path:string)=>/^\/email\/(unsubscribe|process|poll|events\/(smtp|resend)|make\/(catalog|lead|queue|process|poll|events\/claim|events\/ack))$/.test(path);
export const isEmailEndpoint=(path:string)=>isPublicEmailEndpoint(path)||isSequenceEndpoint(path)||/^\/email\/(run|metrics|settings|domains|mailboxes|verify|queue|process|events|unsubscribe|alerts|send)(\/|$)/.test(path)||/^\/email-accounts(\/|$)/.test(path);
function domain(value:unknown) {const s=String(value??'').trim().toLowerCase();if(!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(s)) throw new EmailInputError('Enter a domain name without a URL or path');return s;}
function mailboxInput(b:any) {
 const email=String(b.fromEmail??'').trim().toLowerCase();
 if(!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]+$/.test(email)) throw new EmailInputError('Enter a single mailbox email address');
 if(!['smtp','resend'].includes(b.provider)) throw new EmailInputError('Choose SMTP or Resend');
 if(b.provider==='smtp' && (!b.smtpUser || !b.smtpHost || ![465,587].includes(Number(b.smtpPort)))) throw new EmailInputError('SMTP requires a host, username and TLS port 465 or 587');
 const secret=b.provider==='smtp'?b.smtpPassword:b.apiKey;if(typeof secret!=='string'||!secret.trim()) throw new EmailInputError('Mailbox credentials are required');
 if(b.provider==='resend' && !/^[a-f0-9-]{36}$/i.test(String(b.resendDomainId??''))) throw new EmailInputError('Enter the domain ID from Resend');
 if(!String(b.fromName??'').trim() || /[\r\n]/.test(String(b.fromName))) throw new EmailInputError('A sender name is required');
 return {fromName:String(b.fromName).trim(),fromEmail:email,domainId:String(b.domainId??''),provider:b.provider,smtpHost:b.provider==='smtp'?String(b.smtpHost):'',smtpPort:Number(b.smtpPort??587),smtpUser:b.provider==='smtp'?String(b.smtpUser):'',dailyCap:Number(b.dailyCap??30),timezone:String(b.timezone??'America/New_York'),encryptedCredentials:encryptCredentials(b.provider==='smtp'?{password:secret}:{apiKey:secret,domainId:String(b.resendDomainId)},email)};
}
export class EmailService {
 constructor(private rpc:EmailRpc,private transport:(mailbox:Record<string,any>)=>EmailTransport,private verifier:VerificationProvider=new ZeroBounceVerifier(process.env.ZEROBOUNCE_API_KEY??''),private fetcher:typeof fetch=fetch,private delay:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms)),private inboxFactory?:InboxFactory){}
 private admin(action:string,data:Record<string,unknown>={},c?:EmailContext) {return this.rpc('outreach_email_admin',{p_action:action,p_data:data,p_actor:c?.actor??'system',p_scope:c?.scope??null});}
 async process() {
  if(process.env.OUTREACH_EMAIL_ENABLED!=='true') return {sent:0,held:true};
  keyring();const origin=publicEmailUrl();
  if(this.inboxFactory) await new SequenceService(this.rpc,this.inboxFactory).poll();
  // One dispatch per invocation bounds serverless duration and spaces real send times.
  await this.delay(randomInt(3000,17000));
  if(new Date().getUTCSeconds()<2) await this.delay(2200);
  const claim=await this.rpc('outreach_email_claim',{});if(!claim) return {sent:0};
  const j=claim.job,m=claim.mailbox;
  if(m.smtp_monitoring_mode==='inbox') {
   const checked=await new SequenceService(this.rpc,this.inboxFactory).poll(String(m.id));
   if(checked.polled!==1||!checked.caughtUp){await this.rpc('outreach_email_smtp_admin',{p_action:'release',p_data:{id:String(m.id),job:j.id,claim:j.claim_token},p_actor:'system'});return {sent:0,held:true,reason:'Inbox must finish checking replies and bounces.'};}
  }
  let outcome:'sent'|'failed'|'unknown'='failed';let messageId:string|null=null;let dispatched=false;let hardBounce=false;
  try {
   const links=plainText(j.subject,j.body,claim.directLinkDomains??[]);await checkDirectLinks(links,this.fetcher);
   const sender=this.transport(m);
   await sender.prepare?.(m.from_email);
   const unsubscribe=`${origin}/api/email/unsubscribe?token=${encodeURIComponent(j.unsubscribe_token)}`;
   const message:OutboundMessage={jobId:j.id,fromName:m.from_name,fromEmail:m.from_email,to:j.to_email,subject:j.subject,text:`${j.body}\n\nUnsubscribe: ${unsubscribe}`,messageId:`<${j.id}@${claim.domain}>`,headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click','X-Outreach-ID':j.id}};
   if(claim.thread?.inReplyTo){message.headers['In-Reply-To']=claim.thread.inReplyTo;message.headers.References=claim.thread.references;}
   const allowed=await this.rpc('outreach_email_dispatch_check',{p_job:j.id,p_claim:j.claim_token});
   if(!allowed&&claim.phase3){await this.rpc('outreach_sequence_release',{p_job:j.id,p_claim:j.claim_token});return {sent:0,held:true};}
   if(allowed && process.env.OUTREACH_EMAIL_ENABLED==='true') {dispatched=true;const result=await sender.send(message);messageId=result.messageId;outcome='sent';}
  } catch(error) {hardBounce=error instanceof SmtpRecipientRejected;outcome=dispatched&&!hardBounce?'unknown':'failed';}
  // A failed acknowledgement must never cause the provider send to be retried.
  await this.rpc('outreach_email_finish',{p_job:j.id,p_claim:j.claim_token,p_state:outcome,p_message_id:messageId});
  if(hardBounce)await this.rpc('outreach_email_event',{p_provider:'smtp',p_event:`rcpt:${j.id}`,p_job:j.id,p_message:null,p_type:'hard_bounce'});
  return {sent:outcome==='sent'?1:0,state:outcome};
 }
 async handle(c:EmailContext):Promise<EmailReply> {
  if(isSequenceEndpoint(c.path))return new SequenceService(this.rpc,this.inboxFactory).handle(c);
  const p=c.path,b=c.body??{};const ok=(body:any,status=200)=>({status,body});
  if(!isEmailEndpoint(p)) return ok({error:'Not found'},404);
  if(p.startsWith('/email/make/')) {
   const hash=await this.rpc('outreach_make_admin',{p_action:'secret'});
   const authorization=c.headers.authorization??'';
   if(!hash||!authorization.startsWith('Bearer ')||!safeEqual(tokenHash(authorization.slice(7)),hash))return ok({error:'Invalid Make connection token'},401);
   const action=p.slice('/email/make/'.length);
   if(action==='catalog'&&c.method==='GET')return ok(await this.rpc('outreach_make_admin',{p_action:'catalog'}));
   if(action==='lead'&&c.method==='POST')return ok(await this.rpc('outreach_make_admin',{p_action:'lead',p_data:{id:String(b.leadId??'')}}));
   if(action==='events/claim'&&c.method==='POST')return ok(await this.rpc('outreach_make_admin',{p_action:'claim'}));
   if(action==='events/ack'&&c.method==='POST')return ok(await this.rpc('outreach_make_admin',{p_action:'ack',p_data:{id:String(b.id??''),lease:String(b.lease??'')}}));
   if(action==='process'&&c.method==='POST')return ok(await this.process());
   if(action==='poll'&&c.method==='POST')return ok(await new SequenceService(this.rpc,this.inboxFactory).poll());
   if(action==='queue'&&c.method==='POST') {
    if(typeof b.eventKey!=='string'||!b.eventKey.trim()||b.eventKey.length>200)throw new EmailInputError('A stable eventKey of 1 to 200 characters is required for retry protection');
    let payload={...b};
    if(b.workflowId){
     if(!Number.isInteger(b.stepIndex)||b.stepIndex<0)throw new EmailInputError('Choose a zero-based email stepIndex');
     const template=await this.rpc('outreach_make_admin',{p_action:'template',p_data:{workflowId:String(b.workflowId),stepIndex:b.stepIndex,leadId:String(b.leadId??'')}});
     payload={...payload,...template};
    }
    if(!payload.mailboxId)throw new EmailInputError('Choose a mailbox for this workflow email');
    const rpc:EmailRpc=(name,args)=>name==='outreach_email_enqueue'?this.rpc('outreach_make_enqueue',{p_event_key:b.eventKey,p_args:args}):this.rpc(name,args);
    return new EmailService(rpc,this.transport,this.verifier,this.fetcher,this.delay,this.inboxFactory).handle({...c,path:'/email/queue',body:payload,authenticated:true,actor:'make',scope:null});
   }
   return ok({error:'Unsupported Make operation'},405);
  }
  if(p==='/email/unsubscribe' && ['GET','POST'].includes(c.method)) {
   const token=String(b.token??'');if(!/^[A-Za-z0-9_-]{43}$/.test(token)) return {status:400,body:'Invalid unsubscribe link.',text:true};
   const found=await this.rpc('outreach_email_unsubscribe',{p_hash:tokenHash(token)});
   return {status:found?200:404,body:found?'You have been unsubscribed. No further outreach will be sent.':'Invalid unsubscribe link.',text:true};
  }
  if(p==='/email/process' && ['POST','GET'].includes(c.method)) {
   const secret=process.env.OUTREACH_WORKER_TOKEN??'';if(secret.length<32 || !safeEqual(c.headers.authorization??'',`Bearer ${secret}`)) return ok({error:'Unauthorized'},401);
   return ok(await this.process());
  }
  if(p.startsWith('/email/events/') && c.method==='POST') {
   if(!c.raw) throw new EmailInputError('Signed events require the original raw request body');
   const provider=p.endsWith('/resend')?'resend':'smtp';let eventId:string;let type:string|undefined;let jobId:string|null=null;let messageId:string|null=null;
   if(provider==='resend') {
    eventId=c.headers['svix-id'];verifyResendSignature(c.raw,eventId,c.headers['svix-timestamp']??'',c.headers['svix-signature']??'',process.env.RESEND_WEBHOOK_SECRET??'');
    const event=JSON.parse(c.raw);type=({'email.bounced':'hard_bounce','email.complained':'complaint','email.delivered':'delivered'} as Record<string,string>)[event.type];messageId=event.data?.email_id??null;
   } else {
    verifyEventSignature(c.raw,c.headers['x-outreach-timestamp']??'',c.headers['x-outreach-signature']??'',process.env.OUTREACH_EVENT_SECRET??'');
    const event=JSON.parse(c.raw);eventId=event.eventId;type=event.type;jobId=event.jobId??null;messageId=event.messageId??null;
   }
   if(!type) return ok({received:true,ignored:true});
   if(!eventId || eventId.length>200 || !['delivered','hard_bounce','complaint'].includes(type)) throw new EmailInputError('Invalid email event');
   await this.rpc('outreach_email_event',{p_provider:provider,p_event:eventId,p_job:jobId,p_message:messageId,p_type:type});return ok({received:true});
  }
  if(!c.authenticated) return ok({error:'Unauthorized'},401);
  if(p==='/email/settings/make') {
   if(c.scope)throw new EmailInputError('Make connections require an operator account');
   if(c.method==='GET')return ok(await this.rpc('outreach_make_admin',{p_action:'status'}));
   if(c.method==='POST') {
    const token=randomBytes(32).toString('base64url');
    await this.rpc('outreach_make_admin',{p_action:'rotate',p_data:{hash:tokenHash(token)},p_actor:c.actor??'operator'});
    return ok({token,configured:true});
   }
   if(c.method==='DELETE')return ok(await this.rpc('outreach_make_admin',{p_action:'revoke',p_actor:c.actor??'operator'}));
   return ok({error:'Unsupported Make operation'},405);
  }
  if(p==='/email/run'&&c.method==='POST'){if(c.scope)throw new EmailInputError('Manual queue dispatch requires an operator account');return ok(await this.process());}
  const metrics=p.match(/^\/email\/metrics\/(\d{4}-\d{2}-\d{2}|call-outcome|reply-outcome)$/);
  if(metrics) {
   const action=metrics[1];let data:Record<string,unknown>;
   if(c.method==='GET' && /^\d{4}-/.test(action)) {
    const date=new Date(`${action}T00:00:00Z`);if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==action) throw new EmailInputError('Choose a valid week start');data={week:action};
   } else if(c.method==='POST' && action==='call-outcome') {
    if(typeof b.connected!=='boolean'||typeof b.conversation!=='boolean'||b.conversation&&!b.connected) throw new EmailInputError('A conversation must also be a connected call');
    if(b.meetingHeldAt && !Number.isFinite(Date.parse(b.meetingHeldAt))) throw new EmailInputError('Invalid meeting held time');
    data={id:String(b.id),connected:b.connected,conversation:b.conversation,meetingHeldAt:b.meetingHeldAt||null};
   } else if(c.method==='POST' && action==='reply-outcome') {
    if(typeof b.positive!=='boolean') throw new EmailInputError('Choose a reply outcome');data={id:String(b.id),positive:b.positive};
   } else return ok({error:'Method not allowed'},405);
   return ok(await this.rpc('outreach_email_metrics',{p_action:action==='call-outcome'?'call_outcome':action==='reply-outcome'?'reply_outcome':'report',p_data:data,p_actor:c.actor??'operator',p_scope:c.scope??null}));
  }
  if(p.startsWith('/email-accounts')) {
   if(p==='/email-accounts' && c.method==='GET') {const data=await this.admin('dashboard',{},c);return ok(data.mailboxes.map((m:any)=>({id:m.id,fromName:m.from_name,fromEmail:m.from_email,dailyLimit:m.daily_cap,sentToday:m.sent_today,status:m.status})));}
   return ok({error:'Manage mailboxes in the Outreach Mailboxes screen.'},410);
  }
  if(p==='/email/settings' && c.method==='GET') {const data=await this.admin('dashboard',{},c);const monitoring=await this.rpc('outreach_email_smtp_admin',{p_action:'status'});const verification=await this.rpc('outreach_email_smtp_admin',{p_action:'verification_status'});return ok({...data,mailboxes:data.mailboxes.map((m:any)=>({...m,...monitoring.find((x:any)=>String(x.id)===String(m.id))})),verificationConfigured:!!process.env.ZEROBOUNCE_API_KEY||verification.configured,deploymentEnabled:process.env.OUTREACH_EMAIL_ENABLED==='true'});}
  if(p==='/email/settings/verification'&&c.method==='POST'){
   if(typeof b.apiKey!=='string'||!b.apiKey.trim()||b.apiKey.length>500)throw new EmailInputError('Enter your ZeroBounce API key');
   return ok(await this.rpc('outreach_email_smtp_admin',{p_action:'verification_key',p_data:{credentials:encryptCredentials({apiKey:b.apiKey.trim()},'outreach:zerobounce')},p_actor:c.actor??'operator'}));
  }
  if(p==='/email/settings' && c.method==='PATCH') {
   const data:any={};for(const k of ['engineEnabled','globalDailyCap','resetTimezone']) if(b[k]!==undefined) data[k]=b[k];
   for(const k of ['primaryDomains','directLinkDomains']) if(b[k]!==undefined) {if(!Array.isArray(b[k])) throw new EmailInputError('Domains must be a list');data[k]=b[k].map(domain);}
   if(data.engineEnabled) {
    keyring();publicEmailUrl();
    if(!data.primaryDomains?.length){const current=await this.admin('dashboard',{},c);data.primaryDomains=[...new Set([...current.settings.primary_domains,...current.domains.filter((d:any)=>d.is_primary).map((d:any)=>d.domain)])];}
    if(!data.primaryDomains.length)throw new EmailInputError('Add your primary company domain before enabling sending');
   }
   return ok(await this.admin('settings',data,c));
  }
  if(p==='/email/domains' && c.method==='POST') {
   const selector=String(b.dkimSelector??'default');if(!/^[a-zA-Z0-9_-]+$/.test(selector)) throw new EmailInputError('Invalid DKIM selector');
   const name=domain(b.domain);
   try{
    const result=await this.rpc('outreach_email_domain_create',{p_data:{domain:name,isPrimary:b.isPrimary===true,dkimSelector:selector},p_actor:c.actor??'operator'});
    return ok(result,result.alreadyExists||result.restored?200:201);
   }
   catch(error) {
    if(error instanceof Error && /Burned domains cannot be restored/i.test(error.message)) throw new EmailInputError('This domain was marked burned and cannot be restored. Use another sending domain.');
    if(error instanceof Error && /outreach_email_domain_create.*(?:schema cache|does not exist)|Could not find.*outreach_email_domain_create/i.test(error.message)) throw new EmailInputError('Install the domain restore migration (20260915_outreach_domain_restore.sql), then retry.');
    throw error;
   }
  }
  const domainEdit=p.match(/^\/email\/domains\/([^/]+)$/);
  if(domainEdit && ['PATCH','DELETE'].includes(c.method)) {
   const data:Record<string,unknown>={id:domainEdit[1]};
   if(b.allowPrimarySending!==undefined) {if(typeof b.allowPrimarySending!=='boolean') throw new EmailInputError('Invalid primary sending setting');data.allowPrimarySending=b.allowPrimarySending;}
   if(b.dkimSelector!==undefined) {if(!/^[a-zA-Z0-9_-]+$/.test(b.dkimSelector)) throw new EmailInputError('Invalid DKIM selector');data.dkimSelector=b.dkimSelector;}
   if(b.spfHost!==undefined) data.spfHost=domain(b.spfHost);
   return ok(await this.rpc('outreach_email_domain_admin',{p_action:c.method==='DELETE'?'delete':'update',p_data:data,p_actor:c.actor??'operator'}));
  }
  const verifyDomain=p.match(/^\/email\/domains\/([^/]+)\/verify$/);
  if(verifyDomain && c.method==='POST') {
   const d=await this.admin('domain_get',{id:verifyDomain[1]},c);if(!d) return ok({error:'Domain not found'},404);
   const txt=async(name:string)=>{try{return (await resolveTxt(name)).map(parts=>parts.join(''));}catch{return [];}};
   const [spf,dkim,dmarc]=await Promise.all([txt(d.spf_host??d.domain),txt(`${d.dkim_selector}._domainkey.${d.domain}`),txt(`_dmarc.${d.domain}`)]);
   const data={id:d.id,spf:spf.filter(x=>/^v=spf1\s/i.test(x)).length===1 && spf.some(x=>/\s[~-]all\s*$/i.test(x)),dkim:dkim.some(x=>/\bp\s*=\s*[a-zA-Z0-9+/]{20,}/.test(x)),dmarc:dmarc.filter(x=>/^v=DMARC1\s*;/i.test(x)).length===1 && dmarc.some(x=>/\bp\s*=\s*(none|quarantine|reject)(;|\s|$)/i.test(x))};
   const dnsIssues:string[]=[];
   if(!data.spf)dnsIssues.push(`SPF: publish one valid SPF record at ${d.spf_host??d.domain}`);
   if(!data.dkim)dnsIssues.push(`DKIM: no valid key found at ${d.dkim_selector}._domainkey.${d.domain}; use the selector from your sending provider`);
   if(!data.dmarc)dnsIssues.push(dmarc.filter(x=>/^v=DMARC1\s*;/i.test(x)).length>1?'DMARC: multiple policies found; keep one DMARC TXT record':`DMARC: publish one valid policy at _dmarc.${d.domain}`);
   return ok({...await this.admin('domain_verify',data,c),dnsIssues});
  }
  if(p==='/email/mailboxes' && c.method==='POST') return ok(await this.admin('mailbox_create',mailboxInput(b),c),201);
  const smtpAction=p.match(/^\/email\/mailboxes\/([^/]+)\/(smtp|monitor)$/);
  if(smtpAction&&c.method==='POST') {
   const m=await this.admin('mailbox_secret',{id:smtpAction[1]},c);if(!m||m.provider!=='smtp')throw new EmailInputError('SMTP mailbox not found');
   if(smtpAction[2]==='smtp') {
    if(!/^[a-z0-9.-]+$/i.test(b.host??'')||![465,587].includes(Number(b.port))||!b.user||!b.password)throw new EmailInputError('Enter the SMTP host, TLS port, login email, and app password');
    const credentials=encryptCredentials({password:String(b.password)},m.from_email);
    const transport=this.transport({...m,smtp_host:String(b.host),smtp_port:Number(b.port),smtp_user:String(b.user),smtp_password:credentials});
    try{if(!transport.prepare)throw new Error();await transport.prepare(m.from_email);}catch{throw new EmailInputError('SMTP login failed. Check the provider host, login address and app password.');}
    return ok(await this.rpc('outreach_email_smtp_admin',{p_action:'connection',p_data:{id:String(m.id),host:String(b.host),port:Number(b.port),user:String(b.user),credentials},p_actor:c.actor??'operator'}));
   }
   const sequences=new SequenceService(this.rpc,this.inboxFactory);
   if(b.reuseGmail===true) {
    if(String(m.smtp_host).toLowerCase()!=='smtp.gmail.com')throw new EmailInputError('Enter your Gmail inbox credentials below');
    const secret=decryptCredentials(m.smtp_password,m.from_email);
    await sequences.handle({...c,path:`/email/inboxes/${m.id}`,method:'PUT',body:{provider:'imap',host:'imap.gmail.com',user:m.smtp_user,password:secret.password,folder:'INBOX'}});
   }else if(b.host) {
    await sequences.handle({...c,path:`/email/inboxes/${m.id}`,method:'PUT',body:{provider:'imap',host:b.host,user:b.user,password:b.password,folder:b.folder??'INBOX'}});
   }
   const checked=await sequences.poll(String(m.id));
   if(checked.polled!==1||!checked.caughtUp)throw new EmailInputError(checked.error??'Inbox scan is still running. Click Check inbox again before enabling sending.');
   return ok(await this.rpc('outreach_email_smtp_admin',{p_action:'monitor',p_data:{id:String(m.id)},p_actor:c.actor??'operator'}));
  }
  const mailbox=p.match(/^\/email\/mailboxes\/([^/]+)$/);
  if(mailbox && c.method==='PATCH') {
   const data:any={id:mailbox[1]};for(const k of ['status','engineEnabled','dailyCap']) if(b[k]!==undefined) data[k]=b[k];
   if(data.status && !['warming','active','paused','burned'].includes(data.status)) throw new EmailInputError('Invalid mailbox status');
   if(b.smtpPassword||b.apiKey||data.engineEnabled) {
    const m=await this.admin('mailbox_secret',{id:mailbox[1]},c);if(!m) return ok({error:'Mailbox not found'},404);
    if(data.engineEnabled) {
     if(m.smtp_monitoring_mode==='inbox'){
      const checked=await new SequenceService(this.rpc,this.inboxFactory).poll(String(m.id));
      if(checked.polled!==1||!checked.caughtUp)throw new EmailInputError('Check the receiving inbox before enabling sending. Inbox access must work for reply and bounce monitoring.');
     }else if(!(m.provider==='resend'?process.env.RESEND_WEBHOOK_SECRET:(process.env.OUTREACH_EVENT_SECRET??'').length>=32))throw new EmailInputError(m.provider==='smtp'?'Connect receiving inbox monitoring below, or configure your provider event webhook.':'Configure the Resend webhook secret before enabling sending');
    }
    if(b.smtpPassword||b.apiKey) {
     if(m.provider==='resend' && !/^[a-f0-9-]{36}$/i.test(String(b.resendDomainId??''))) throw new EmailInputError('Enter the domain ID from Resend when rotating its key');
     data.encryptedCredentials=encryptCredentials(m.provider==='smtp'?{password:String(b.smtpPassword??'')}:{apiKey:String(b.apiKey??''),domainId:String(b.resendDomainId)},m.from_email);
    }
   }
   return ok(await this.admin('mailbox_update',data,c));
  }
  const verification=p.match(/^\/email\/verify\/([^/]+)$/);
  if(verification && c.method==='GET') {const l=await this.admin('lead',{id:verification[1]},c);return l?ok({status:l.email_verification_status,verifiedAt:l.verified_at}):ok({error:'Eligible lead not found'},404);}
  if(verification && c.method==='POST') {
   const lead=await this.admin('lead',{id:verification[1]},c);if(!lead) return ok({error:'Eligible lead not found'},404);
   let verifier=this.verifier;
   if(verifier instanceof ZeroBounceVerifier&&!process.env.ZEROBOUNCE_API_KEY){
    const encrypted=await this.rpc('outreach_email_smtp_admin',{p_action:'verification_secret'});
    if(!encrypted)throw new EmailInputError('Add your ZeroBounce API key in Mailboxes before verifying recipients');
    verifier=new ZeroBounceVerifier(decryptCredentials(encrypted,'outreach:zerobounce').apiKey??'');
   }
   const status=await verifier.verify(lead.normalized_email);
   return ok(await this.admin('verification',{id:verification[1],email:lead.normalized_email,status,provider:verifier.name},c));
  }
  if(['/email/queue','/email/send'].includes(p) && c.method==='POST') {
   if(b.html!==undefined || b.attachments!==undefined) throw new EmailInputError('Only plain text email is supported');
   const data=await this.admin('dashboard',{},c);const subject=String(b.subject??''),body=String(b.body??'');await checkDirectLinks(plainText(subject,body,data.settings.direct_link_domains),this.fetcher);
   const token=unsubscribeToken();return ok(await this.rpc('outreach_email_enqueue',{p_lead:String(b.leadId??''),p_subject:subject,p_body:body,p_mailbox:b.mailboxId||b.emailAccountId?String(b.mailboxId??b.emailAccountId):null,p_enrollment:b.enrollmentId?String(b.enrollmentId):null,p_token:token,p_hash:tokenHash(token),p_actor:c.actor??'operator',p_scope:c.scope??null}),202);
  }
  const alert=p.match(/^\/email\/alerts\/(\d+)\/acknowledge$/);
  if(alert && c.method==='POST') return ok(await this.admin('acknowledge',{id:alert[1]},c));
  return ok({error:'Unsupported email operation'},405);
 }
}
