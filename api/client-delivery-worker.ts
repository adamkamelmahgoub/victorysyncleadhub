import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { clientReportPdf } from '../lib/client-report-pdf.js';
import {previousReportPeriod,reportMetricRange} from '../lib/client-report-period.js';
import {mightyCallAuthUrl,mightyCallProduct,mightyCallUrl} from '../lib/mightycall-endpoints.js';
import {externalSendsEnabled,requireExternalSends} from '../lib/external-send-mode.js';
import {clientPortalLink} from '../lib/client-portal-link.js';

export const config = { api: { bodyParser: false }, maxDuration: 60 };
const inputSchema = z.object({ limit: z.number().int().min(1).max(50).optional() }).strict();
type Job = {id:string;client_account_id:string;lead_id:string|null;workflow_id:string|null;kind:'lead_followup'|'lead_email'|'lead_nudge'|'agent_call_task'|'missed_call_text'|'review_request'|'review_reminder'|'weekly_report'|'report_send'|'owner_alert'|'stop_confirmation';source_id:string;attempts:number;payload:Record<string,unknown>};
type Account = {id:string;name:string;owner_email:string;phone:string|null;email?:string;package:string|null;timezone:string|null;mightycall_number:string|null;google_review_link:string|null;account_manager_user_id:string|null;brand:{primary?:string}|null;settings:Record<string,unknown>|null};
type Lead = {id:string;phone:string|null;email:string|null;first_name:string|null;dnc:boolean|null;source:string|null;opt_in_source:string|null;pipeline_stage_id:string|null;created_at:string};
let mightyToken:{value:string;expires:number}|null=null;

function serviceKey() { const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY; if(!key)throw Error('Supabase service key missing');return key; }
async function rest<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const base=process.env.SUPABASE_URL;if(!base)throw Error('Supabase URL missing');
  const key=serviceKey();
  const response=await fetch(`${base}/rest/v1/${path}`,{method,headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',prefer:path.includes('on_conflict=')?'resolution=merge-duplicates,return=representation':'return=representation'},
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const data=await response.json().catch(()=>null) as T|{message?:string};
  if(!response.ok)throw Error(data&&typeof data==='object'&&'message'in data?String(data.message):`Database ${response.status}`);
  return data as T;
}
async function row<T>(table:string,filter:string):Promise<T|null> {
  const rows=await rest<T[]>(`${table}?${filter}&select=*&limit=1`);return rows[0]||null;
}
async function enabled(accountId:string) {
  return await rest<boolean>('rpc/client_delivery_enabled','POST',{p_account:accountId});
}
function e164(value:string|null|undefined) {
  const digits=String(value||'').replace(/\D/g,'');
  const normalized=digits.length===10?`+1${digits}`:digits.length===11&&digits.startsWith('1')?`+${digits}`:'';
  return /^\+1\d{10}$/.test(normalized)?normalized:null;
}
async function mightyAuth() {
  if(mightyToken&&mightyToken.expires>Date.now()+60_000)return mightyToken.value;
  const key=process.env.MIGHTYCALL_API_KEY,secret=process.env.MIGHTYCALL_SECRET_KEY||process.env.MIGHTYCALL_USER_KEY;
  if(!key||!secret)throw Error('MightyCall is not configured');
  const response=await fetch(mightyCallAuthUrl(mightyCallProduct(process.env.MIGHTYCALL_PRODUCT)),{method:'POST',
    headers:{'x-api-key':key,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'client_credentials',client_id:key,client_secret:secret}),signal:AbortSignal.timeout(12000)});
  const data=await response.json() as {access_token?:string;expires_in?:number};
  if(!response.ok||!data.access_token)throw Error('MightyCall authentication failed');
  mightyToken={value:data.access_token,expires:Date.now()+(data.expires_in||3600)*1000};return data.access_token;
}
async function mighty(path:string,method='GET',body?:unknown) {
  if(method!=='GET')requireExternalSends();
  const key=process.env.MIGHTYCALL_API_KEY;if(!key)throw Error('MightyCall API key missing');
  const response=await fetch(mightyCallUrl(mightyCallProduct(process.env.MIGHTYCALL_PRODUCT),path),{method,
    headers:{authorization:`Bearer ${await mightyAuth()}`,'x-api-key':key,'content-type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const data=await response.json().catch(()=>null) as Record<string,unknown>|null;
  if(!response.ok)throw Error(`MightyCall ${response.status}`);
  return data;
}
async function sendText(account:Account,to:string,message:string,job:Job) {
  const from=e164(account.mightycall_number),recipient=e164(to);
  if(!from||!recipient)throw Error('A valid U.S. business and recipient number is required');
  if(await rest<boolean>('rpc/client_phone_dnc','POST',{p_account:account.id,p_phone:recipient}))return false;
  const logged=await rest<Array<{id:string}>>(`mightycall_sms_messages?client_account_id=eq.${account.id}&metadata->>automation_job_id=eq.${job.id}&select=id&limit=1`);
  if(logged.length)return true;
  const text=message.includes('Reply STOP to opt out')?message:`${message} Reply STOP to opt out`;
  const sent=await mighty('messages/send','POST',{from,to:[recipient],message:text});
  await rest('mightycall_sms_messages','POST',{org_id:'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    client_account_id:account.id,from_number:from,to_number:recipient,direction:'outbound',
    message_text:text,status:'sent',external_sms_id:sent?.id||null,metadata:{automation_job_id:job.id,automation_kind:job.kind}});
  return true;
}
async function sendEmail(to:string,subject:string,body:string,job:Job) {
  requireExternalSends();
  if(!process.env.RESEND_API_KEY||!process.env.REPORT_FROM_EMAIL)throw Error('Report email is not configured');
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${process.env.RESEND_API_KEY}`,
    'content-type':'application/json','Idempotency-Key':`${job.id}-${crypto.createHash('sha256').update(to.toLowerCase()).digest('hex').slice(0,12)}`},body:JSON.stringify({from:process.env.REPORT_FROM_EMAIL,to:[to],subject,text:body}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error(`Email delivery ${response.status}`);
}
function coveredNow(account:Account){
  const configured=account.settings?.covered_hours as {start?:string;end?:string;days?:number[]}|undefined;
  const start=/^([01]\d|2[0-3]):[0-5]\d$/.test(configured?.start||'')?configured?.start:'09:00';
  const end=/^([01]\d|2[0-3]):[0-5]\d$/.test(configured?.end||'')?configured?.end:'17:00';
  const days=Array.isArray(configured?.days)?configured.days:[1,2,3,4,5];
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:account.timezone||'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const part=(type:string)=>parts.find(x=>x.type===type)?.value||'';
  const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(part('weekday'));
  const time=`${part('hour')}:${part('minute')}`;
  return days.includes(day)&&time>=start!&&time<end!;
}
async function load(job:Job) {
  const account=await row<Account>('sub_accounts',`id=eq.${job.client_account_id}`);
  if(!account||job.kind!=='stop_confirmation'&&!await enabled(account.id))return null;
  return account;
}
async function routeCalls() {
  const [events,accounts]=await Promise.all([
    rest<Array<{id:string;external_call_id:string|null;event_type:string;occurred_at:string}>>('mightycall_webhook_inbox?client_routed_at=is.null&external_call_id=not.is.null&select=id,external_call_id,event_type,occurred_at&order=client_route_attempted_at.asc.nullsfirst&limit=20'),
    rest<Account[]>('sub_accounts?mightycall_number=not.is.null&select=id,name,owner_email,mightycall_number,google_review_link,account_manager_user_id,settings'),
  ]);
  for(const event of events){
    if(!event.external_call_id)continue;
    try{
      const call=await mighty(`calls/${encodeURIComponent(event.external_call_id)}`);
      const details=(call?.data||call) as {businessNumber?:string;caller?:{phone?:string};called?:Array<{name?:string;isConnected?:boolean}>;callStatus?:string;direction?:string;dateTimeUtc?:string;duration?:string|number;callRecord?:{uri?:string};note?:string};
      const business=e164(details.businessNumber);
      const matched=business?accounts.find(item=>e164(item.mightycall_number)===business):undefined;
      if(!matched){await rest(`mightycall_webhook_inbox?id=eq.${event.id}`,'PATCH',{client_route_attempted_at:new Date().toISOString()});continue;}
      const caller=e164(details.caller?.phone);
      const lead=caller?await rest<Lead[]>(`leads?client_account_id=eq.${matched.id}&normalized_phone=eq.${encodeURIComponent(caller)}&select=id&limit=1`):[];
      const durationMs=Number(details.duration);
      const recording=details.callRecord?.uri;
      await rest('client_call_details?on_conflict=client_account_id,external_call_id','POST',{
        client_account_id:matched.id,external_call_id:event.external_call_id,lead_id:lead[0]?.id||null,
        occurred_at:details.dateTimeUtc||event.occurred_at,caller_number:caller,
        business_number:business,status:details.callStatus||null,direction:details.direction||null,
        duration_seconds:Number.isFinite(durationMs)&&durationMs>=0?Math.round(durationMs/1000):null,
        recording_url:recording&&recording.startsWith('https://')?recording:null,
        agent_name:details.called?.find(x=>x.isConnected)?.name||null,summary:details.note||null,
      });
      await rest(`mightycall_webhook_inbox?id=eq.${event.id}`,'PATCH',{
        client_account_id:matched.id,caller_number:caller,
        business_number:business,call_status:details.callStatus||null,
        call_direction:details.direction||null,client_route_attempted_at:new Date().toISOString(),
        client_routed_at:new Date().toISOString(),
      });
      if(process.env.SLACK_WEBHOOK_URL&&externalSendsEnabled()){
        const usage=await rest<{minutesUsed:number;minutesIncluded:number}>('rpc/client_usage_meter','POST',{p_account:matched.id});
        if(usage.minutesIncluded>0&&usage.minutesUsed>=Math.ceil(usage.minutesIncluded*0.8)){
          const month=new Date().toISOString().slice(0,7)+'-01';
          const exists=await rest<Array<{id:string}>>(`client_usage_alerts?client_account_id=eq.${matched.id}&month=eq.${month}&threshold=eq.80&select=id&limit=1`);
          if(!exists.length){
            const manager=matched.account_manager_user_id?await row<{slack_user_id:string|null}>('profiles',`id=eq.${matched.account_manager_user_id}`):null;
            const message=`${manager?.slack_user_id?`<@${manager.slack_user_id}> `:''}${matched.name} has used ${usage.minutesUsed} of ${usage.minutesIncluded} included call minutes (80% alert).`;
            const notified=await fetch(process.env.SLACK_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:message}),signal:AbortSignal.timeout(5000)});
            if(notified.ok)await rest('client_usage_alerts','POST',{client_account_id:matched.id,month,threshold:80,minutes_used:usage.minutesUsed,minutes_included:usage.minutesIncluded,sent_at:new Date().toISOString()});
          }
        }
      }
    }catch{/* Keep the row available for the next poll. */}
  }
}
async function handle(job:Job) {
  const account=await load(job);if(!account)return 'cancelled';
  if(['lead_followup','lead_email','lead_nudge'].includes(job.kind)) {
    if(!job.lead_id)return 'cancelled';
    const submissionId=job.source_id.split(':')[0];
    const [lead,submission]=await Promise.all([
      row<Lead>('leads',`id=eq.${job.lead_id}&client_account_id=eq.${account.id}`),
      row<{id:string;data:Record<string,unknown>;form_id:string;created_at:string}>('form_submissions',`id=eq.${submissionId}&client_account_id=eq.${account.id}`)]);
    if(!lead||!submission||lead.dnc)return 'cancelled';
    if(job.kind==='lead_email'){
      if(!lead.email||!Object.values(submission.data||{}).some(value=>String(value).trim().toLowerCase()===lead.email?.toLowerCase()))return 'cancelled';
      await sendEmail(lead.email,`We received your request at ${account.name}`,`Hi ${lead.first_name||'there'},\n\nThanks for contacting ${account.name}. We received your request and will follow up shortly.`,job);
      await rest('client_lead_events','POST',{client_account_id:account.id,lead_id:lead.id,event_type:'email',body:`We received your request at ${account.name}`,metadata:{automation_job_id:job.id}});
      return 'sent';
    }
    if(!lead.phone||!Object.values(submission.data||{}).some(value=>e164(String(value))===e164(lead.phone)))return 'cancelled';
    if(job.kind==='lead_nudge'){
      const stage=lead.pipeline_stage_id?await row<{name:string}>('pipeline_stages',`id=eq.${lead.pipeline_stage_id}`):null;
      if(stage&&!['New','Contacted'].includes(stage.name))return 'cancelled';
      const replied=await rest<boolean>('rpc/client_lead_replied','POST',{p_account:account.id,p_lead:lead.id,p_since:submission.created_at});
      if(replied)return 'cancelled';
      const day=job.source_id.endsWith('day3')?'three days':'a day';
      return await sendText(account,lead.phone,`Hi ${lead.first_name||'there'}, checking in from ${account.name}. It has been ${day} since your request. How can we help?`,job)?'sent':'cancelled';
    }
    return await sendText(account,lead.phone,`Hi ${lead.first_name||'there'}, thanks for contacting ${account.name}. We received your request and will follow up shortly.`,job)?'sent':'cancelled';
  }
  if(job.kind==='agent_call_task'){
    if(account.package!=='domination'||!job.lead_id||!coveredNow(account))return 'cancelled';
    const lead=await row<Lead>('leads',`id=eq.${job.lead_id}&client_account_id=eq.${account.id}`);
    if(!lead||lead.dnc)return 'cancelled';
    const existing=await rest<Array<{id:string}>>(`contact_tasks?automation_job_id=eq.${job.id}&select=id&limit=1`);
    if(!existing.length)await rest('contact_tasks','POST',{lead_id:lead.id,title:`Call new ${account.name} lead`,description:'Speed-to-lead call',due_date:new Date(Date.now()+5*60_000).toISOString(),priority:'high',client_account_id:account.id,automation_job_id:job.id});
    return 'sent';
  }
  if(job.kind==='missed_call_text') {
    const callId=job.source_id.startsWith('call:')?job.source_id.slice(5):'';
    if(!callId||callId.length>128)return 'cancelled';
    const event=await row<{id:string;external_call_id:string;call_status:string;call_direction:string}>('mightycall_webhook_inbox',`external_call_id=eq.${encodeURIComponent(callId)}&client_account_id=eq.${account.id}&call_status=ilike.missed`);
    if(!event||event.call_status?.toLowerCase()!=='missed'||!['incoming','inbound'].includes(event.call_direction?.toLowerCase()||'')||!event.external_call_id)return 'cancelled';
    const call=await mighty(`calls/${encodeURIComponent(event.external_call_id)}`);
    const details=(call?.data||call) as {businessNumber?:string;caller?:{phone?:string};direction?:string};
    if(!e164(details.businessNumber)||e164(details.businessNumber)!==e164(account.mightycall_number)||!details.caller?.phone)return 'cancelled';
    const caller=e164(details.caller.phone);if(!caller)return 'cancelled';
    if(await rest<boolean>('rpc/client_phone_dnc','POST',{p_account:account.id,p_phone:caller}))return 'cancelled';
    const leads=await rest<Lead[]>(`leads?client_account_id=eq.${account.id}&normalized_phone=eq.${encodeURIComponent(caller)}&select=id,dnc,phone,source,opt_in_source&limit=1`);
    if(leads[0]?.dnc)return 'cancelled';
    let leadId=leads[0]?.id;
    if(!leadId){const created=await rest<Array<{id:string}>>('leads','POST',{client_account_id:account.id,
      first_name:'Caller',last_name:'',phone:caller,source:'missed_call',opt_in_source:'call',status:'new'});
      leadId=created[0]?.id;}
    if(leadId)await rest(`client_call_details?client_account_id=eq.${account.id}&external_call_id=eq.${encodeURIComponent(event.external_call_id)}&lead_id=is.null`,'PATCH',{lead_id:leadId});
    const recent=await rest<Array<{id:string}>>(`mightycall_sms_messages?client_account_id=eq.${account.id}&to_number=eq.${encodeURIComponent(caller)}&direction=eq.outbound&created_at=gte.${encodeURIComponent(new Date(Date.now()-86400_000).toISOString())}&metadata->>automation_kind=eq.missed_call_text&select=id&limit=1`);
    if(recent.length)return 'cancelled';
    const claimed=await rest<boolean>('rpc/client_claim_missed_call_text','POST',{p_account:account.id,p_phone:caller,p_job:job.id});
    if(!claimed)return 'cancelled';
    const sent=await sendText(account,caller,`Sorry we missed your call! This is ${account.name}. How can we help?`,job);
    if(sent)await rest('rpc/client_mark_missed_call_text_sent','POST',{p_account:account.id,p_phone:caller,p_job:job.id});
    return sent?'sent':'cancelled';
  }
  if(job.kind==='review_request') {
    if(!account.google_review_link||!/^https:\/\//.test(account.google_review_link))return 'cancelled';
    let request:{id:string;lead_id:string|null;contact_name:string;contact_phone:string;contact_email:string|null;click_token:string;clicked_at:string|null}|null=null;
    if(job.source_id.startsWith('request:'))request=await row('review_requests',`id=eq.${job.source_id.slice(8)}&client_account_id=eq.${account.id}`);
    else if(job.source_id.startsWith('lead:')){
      const lead=await row<Lead>('leads',`id=eq.${job.source_id.slice(5)}&client_account_id=eq.${account.id}`);
      if(!lead||lead.dnc||!lead.phone)return 'cancelled';
      const existing=await rest<typeof request[]>(`review_requests?client_account_id=eq.${account.id}&lead_id=eq.${lead.id}&select=*&limit=1`);
      request=existing[0]||null;
      if(!request){const created=await rest<Array<NonNullable<typeof request>>>('review_requests','POST',{client_account_id:account.id,lead_id:lead.id,contact_name:lead.first_name||'Customer',contact_phone:lead.phone,contact_email:lead.email,channel:'sms',platform:'google',status:'pending'});request=created[0]||null;}
    } else {
      const appointment=await row<{guest_name:string;guest_phone:string;lead_id:string|null;status:string}>('booking_appointments',`id=eq.${job.source_id}&client_account_id=eq.${account.id}`);
      if(!appointment||appointment.status!=='completed')return 'cancelled';
      const lead=appointment.lead_id?await row<Lead>('leads',`id=eq.${appointment.lead_id}&client_account_id=eq.${account.id}`):null;
      if(!lead||lead.dnc||!lead.phone)return 'cancelled';
      const created=await rest<Array<NonNullable<typeof request>>>('review_requests','POST',{client_account_id:account.id,lead_id:lead.id,contact_name:appointment.guest_name,contact_phone:lead.phone,contact_email:lead.email,channel:'sms',platform:'google',status:'pending'});request=created[0]||null;
    }
    if(!request||request.clicked_at)return 'cancelled';
    const lead=request.lead_id?await row<Lead>('leads',`id=eq.${request.lead_id}&client_account_id=eq.${account.id}`):null;
    if(!lead||lead.dnc||!e164(lead.phone)||e164(lead.phone)!==e164(request.contact_phone)
      ||!['form','call','missed_call'].includes(lead.opt_in_source||lead.source||''))return 'cancelled';
    const link=`${(process.env.APP_URL||'https://app.victorysync.com').replace(/\/$/,'')}/r/${request.click_token}`;
    if(!await sendText(account,request.contact_phone,`Thanks for choosing ${account.name}. If you would like to share your experience, here is our review link: ${link}`,job))return 'cancelled';
    if(lead.email)await sendEmail(lead.email,`Share your experience with ${account.name}`,`Thank you for choosing ${account.name}. If you would like to leave a review: ${link}`,job);
    await rest(`review_requests?id=eq.${request.id}`,'PATCH',{status:'sent',sent_at:new Date().toISOString()});
    await rest('client_automation_jobs','POST',{client_account_id:account.id,lead_id:lead.id,kind:'review_reminder',source_id:`request:${request.id}`,run_at:new Date(Date.now()+3*86400_000).toISOString()}).catch(()=>undefined);
    return 'sent';
  }
  if(job.kind==='review_reminder'){
    const request=await row<{id:string;lead_id:string|null;contact_phone:string;clicked_at:string|null;click_token:string}>('review_requests',`id=eq.${job.source_id.slice(8)}&client_account_id=eq.${account.id}`);
    if(!request||request.clicked_at||!account.google_review_link)return 'cancelled';
    const lead=request.lead_id?await row<Lead>('leads',`id=eq.${request.lead_id}&client_account_id=eq.${account.id}`):null;
    if(!lead||lead.dnc||!e164(lead.phone)||e164(lead.phone)!==e164(request.contact_phone)
      ||!['form','call','missed_call'].includes(lead.opt_in_source||lead.source||''))return 'cancelled';
    const link=`${(process.env.APP_URL||'https://app.victorysync.com').replace(/\/$/,'')}/r/${request.click_token}`;
    if(!await sendText(account,request.contact_phone,`A quick reminder from ${account.name}: if you would like to share your experience, here is the review link: ${link}`,job))return 'cancelled';
    await rest(`review_requests?id=eq.${request.id}`,'PATCH',{reminder_sent_at:new Date().toISOString()});return 'sent';
  }
  if(job.kind==='stop_confirmation'){
    const recipient=e164(String(job.payload.phone||''));const from=e164(account.mightycall_number);
    if(!recipient||!from)return 'cancelled';
    const existing=await rest<Array<{id:string}>>(`mightycall_sms_messages?client_account_id=eq.${account.id}&metadata->>automation_job_id=eq.${job.id}&select=id&limit=1`);
    if(existing.length)return 'sent';
    const claimed=await rest<boolean>('rpc/client_claim_stop_confirmation','POST',
      {p_account:account.id,p_phone:recipient,p_job:job.id});
    if(!claimed)throw Error('STOP confirmation claim already exists; check MightyCall before retrying');
    const message='You are opted out and will not receive further automated texts.';
    await mighty('messages/send','POST',{from,to:[recipient],message});
    await rest('mightycall_sms_messages','POST',{org_id:'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',client_account_id:account.id,from_number:from,to_number:recipient,direction:'outbound',message_text:message,status:'sent',metadata:{automation_job_id:job.id,automation_kind:job.kind}});
    await rest('rpc/client_mark_stop_confirmation_sent','POST',
      {p_account:account.id,p_phone:recipient,p_job:job.id});
    return 'sent';
  }
  if(job.kind==='owner_alert'){
    const isCall=job.source_id.startsWith('call:');
    const detail=isCall?'A call was missed':'A new lead submitted a form';
    const link=clientPortalLink(isCall?'calls':'leads',process.env.PORTAL_BASE_URL,process.env.APP_URL);
    const preferences=account.settings?.notifications as {email?:boolean;text?:boolean;phone?:string}|undefined;
    if(preferences?.email!==false&&account.owner_email)await sendEmail(account.owner_email,`${account.name}: ${detail}`,`${detail}. Open your client portal: ${link}`,job);
    if(preferences?.text&&preferences.phone)await sendText(account,preferences.phone,`${account.name}: ${detail}. ${link}`,job);
    return 'sent';
  }
  if(job.kind==='weekly_report') {
    const {type,start:from,end:until}=previousReportPeriod(account.package==='domination'?'weekly':'monthly');
    const existing=await rest<Array<{id:string}>>(`report_sends?client_account_id=eq.${account.id}&type=eq.${type}&period_start=eq.${from}&period_end=eq.${until}&select=id&limit=1`);
    if(existing.length)return 'sent';
    await rest('report_sends','POST',{client_account_id:account.id,type,period_start:from,period_end:until,
      recipients:[account.owner_email].filter(Boolean),status:'draft',work_done:'',whats_next:''});
    return 'sent';
  }
  if(job.kind==='report_send'){
    const reportId=job.source_id.startsWith('report:')?job.source_id.slice(7):'';
    if(!/^[0-9a-f-]{36}$/i.test(reportId))return 'cancelled';
    const report=await row<{id:string;type:string;period_start:string;period_end:string;work_done:string|null;whats_next:string|null;status:string}>('report_sends',`id=eq.${reportId}&client_account_id=eq.${account.id}`);
    if(!report||report.status==='sent')return 'cancelled';
    if(!report.work_done?.trim()||!report.whats_next?.trim())throw Error('Report narrative must be completed before sending');
    const range=reportMetricRange({start:report.period_start,end:report.period_end});
    const [rawMetrics,recipients]=await Promise.all([
      rest<unknown>('rpc/client_dashboard_metric_values','POST',
        {p_account:account.id,p_start:range.start,p_end:range.endExclusive}),
      rest<Array<{email:string}>>(`report_recipients?client_account_id=eq.${account.id}&active=eq.true&select=email`),
    ]);
    const metrics=z.object({newLeads:z.number(),bookedJobs:z.number(),answeredCalls:z.number(),
      missedCallsRecovered:z.number(),reviewsReceived:z.number(),averageRating:z.number().nullable(),
      adSpendCents:z.number()}).parse(rawMetrics);
    const pdf=await clientReportPdf({accountName:account.name,periodStart:report.period_start,periodEnd:report.period_end,
      ...metrics,workDone:report.work_done,whatsNext:report.whats_next,brandPrimary:account.brand?.primary});
    const base=process.env.SUPABASE_URL;if(!base)throw Error('Supabase URL missing');const key=serviceKey();
    const path=`${account.id}/${report.id}.pdf`;
    const uploaded=await fetch(`${base}/storage/v1/object/client-reports/${path}`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/pdf','x-upsert':'true'},body:Buffer.from(pdf),signal:AbortSignal.timeout(15000)});
    if(!uploaded.ok)throw Error(`Report storage ${uploaded.status}`);
    const signed=await fetch(`${base}/storage/v1/object/sign/client-reports/${path}`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({expiresIn:604800}),signal:AbortSignal.timeout(10000)});
    const signedBody=await signed.json() as {signedURL?:string};if(!signed.ok||!signedBody.signedURL)throw Error('Report link failed');
    const emails=[...new Set([account.owner_email,...recipients.map(x=>x.email)].filter(Boolean))];
    if(!emails.length)throw Error('No report recipients configured');
    for(const email of emails)await sendEmail(email,`${account.name} ${report.type} report`,
      `Your report is ready. Download the PDF: ${base}/storage/v1${signedBody.signedURL}\n\nWhat we did: ${report.work_done}\nWhat's next: ${report.whats_next}`,job);
    await rest(`report_sends?id=eq.${report.id}`,'PATCH',{status:'sent',pdf_path:path,storage_bucket:'client-reports',sent_at:new Date().toISOString(),recipients:emails});
    return 'sent';
  }
  return 'cancelled';
}
async function read(req:IncomingMessage) {let text='';for await(const chunk of req){text+=chunk;if(text.length>2000)throw Error('Request too large')}return inputSchema.parse(JSON.parse(text||'{}'));}
function reply(res:ServerResponse,status:number,value:unknown){res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(value));}
export default async function handler(req:IncomingMessage,res:ServerResponse) {
  if(req.method!=='POST'&&req.method!=='GET')return reply(res,405,{error:'Method not allowed'});
  const provided=String(req.headers.authorization||'').replace(/^Bearer /,'');
  const secrets=[process.env.CLIENT_DELIVERY_WORKER_SECRET,process.env.CRON_SECRET,process.env.OUTREACH_WORKER_TOKEN].filter((value):value is string=>!!value);
  if(!provided||!secrets.some(secret=>provided.length===secret.length&&
    crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(secret))))return reply(res,401,{error:'Unauthorized'});
  if(!externalSendsEnabled())return reply(res,503,{error:'Delivery worker is disabled outside production or in sandbox mode'});
  let input:z.infer<typeof inputSchema>;
  try{input=req.method==='GET'?inputSchema.parse({}):await read(req)}catch{return reply(res,400,{error:'Invalid input'})}
  try {
    await routeCalls();
    const jobs=await rest<Job[]>('rpc/client_claim_jobs','POST',{p_limit:input.limit||5});
    const results=[];
    for(const job of jobs){
      const trigger=job.kind==='missed_call_text'?'missed_call':job.kind.startsWith('review_')?'appointment_completed':job.kind==='weekly_report'?'scheduled_report':'form_submitted';
      const workflow=job.workflow_id?{id:job.workflow_id}:await row<{id:string}>('automation_workflows',`client_account_id=eq.${job.client_account_id}&trigger_type=eq.${trigger}&is_active=eq.true`).catch(()=>null);
      await rest('automation_runs?on_conflict=job_id','POST',{job_id:job.id,workflow_id:workflow?.id||null,client_account_id:job.client_account_id,lead_id:job.lead_id,status:'running',step:job.kind,started_at:new Date().toISOString(),finished_at:null,error:null});
      try{const status=await handle(job);await rest(`client_automation_jobs?id=eq.${job.id}`,'PATCH',{status,sent_at:status==='sent'?new Date().toISOString():null,last_error:null,claimed_at:null});
        await rest(`automation_runs?job_id=eq.${job.id}`,'PATCH',{status,finished_at:new Date().toISOString()});results.push({id:job.id,status});}
      catch(error){const message=error instanceof Error?error.message:String(error);
        await rest(`client_automation_jobs?id=eq.${job.id}`,'PATCH',{status:'failed',last_error:message.slice(0,500),claimed_at:null,run_at:new Date(Date.now()+Math.min(60,2**job.attempts)*60_000).toISOString()});
        await rest(`automation_runs?job_id=eq.${job.id}`,'PATCH',{status:'failed',error:message.slice(0,500),finished_at:new Date().toISOString()});
        if(job.attempts>=5&&process.env.SLACK_WEBHOOK_URL&&externalSendsEnabled())await fetch(process.env.SLACK_WEBHOOK_URL,{method:'POST',
          headers:{'content-type':'application/json'},body:JSON.stringify({text:`VictorySync client automation failed: ${job.kind} for account ${job.client_account_id}, job ${job.id}`}),
          signal:AbortSignal.timeout(5000)}).catch(()=>undefined);
        results.push({id:job.id,status:'failed'});}
    }
    return reply(res,200,{results});
  }catch(error){return reply(res,500,{error:error instanceof Error?error.message:'Worker failed'})}
}
