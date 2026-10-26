import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';

export const config = { api: { bodyParser: false }, maxDuration: 60 };
const inputSchema = z.object({ limit: z.number().int().min(1).max(50).optional() }).strict();
type Job = {id:string;client_account_id:string;lead_id:string|null;kind:'lead_followup'|'missed_call_text'|'review_request'|'weekly_report';source_id:string;attempts:number;payload:Record<string,unknown>};
type Account = {id:string;name:string;owner_email:string;mightycall_number:string|null;google_review_link:string|null};
type Lead = {id:string;phone:string|null;first_name:string|null;dnc:boolean|null;source:string|null;opt_in_source:string|null};
let mightyToken:{value:string;expires:number}|null=null;

function serviceKey() { const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY; if(!key)throw Error('Supabase service key missing');return key; }
async function rest<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const base=process.env.SUPABASE_URL;if(!base)throw Error('Supabase URL missing');
  const key=serviceKey();
  const response=await fetch(`${base}/rest/v1/${path}`,{method,headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',prefer:'return=representation'},
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
  const key=process.env.MIGHTYCALL_API_KEY,secret=process.env.MIGHTYCALL_SECRET_KEY;
  if(!key||!secret)throw Error('MightyCall is not configured');
  const response=await fetch('https://api.mightycall.com/v4/auth/token',{method:'POST',
    headers:{'x-api-key':key,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'client_credentials',client_id:key,client_secret:secret}),signal:AbortSignal.timeout(12000)});
  const data=await response.json() as {access_token?:string;expires_in?:number};
  if(!response.ok||!data.access_token)throw Error('MightyCall authentication failed');
  mightyToken={value:data.access_token,expires:Date.now()+(data.expires_in||3600)*1000};return data.access_token;
}
async function mighty(path:string,method='GET',body?:unknown) {
  const key=process.env.MIGHTYCALL_API_KEY;if(!key)throw Error('MightyCall API key missing');
  const response=await fetch(`https://api.mightycall.com/v4/api/${path}`,{method,
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
    message_text:text,status:'sent',external_sms_id:sent?.id||null,metadata:{automation_job_id:job.id}});
  return true;
}
async function load(job:Job) {
  const account=await row<Account>('sub_accounts',`id=eq.${job.client_account_id}`);
  if(!account||!await enabled(account.id))return null;
  return account;
}
async function routeCalls() {
  const [events,accounts]=await Promise.all([
    rest<Array<{id:string;external_call_id:string|null;event_type:string}>>('mightycall_webhook_inbox?client_routed_at=is.null&external_call_id=not.is.null&select=id,external_call_id,event_type&order=client_route_attempted_at.asc.nullsfirst&limit=5'),
    rest<Account[]>('sub_accounts?mightycall_number=not.is.null&select=id,name,owner_email,mightycall_number,google_review_link'),
  ]);
  for(const event of events){
    if(!event.external_call_id)continue;
    try{
      const call=await mighty(`calls/${encodeURIComponent(event.external_call_id)}`);
      const details=(call?.data||call) as {businessNumber?:string;caller?:{phone?:string};callStatus?:string;direction?:string};
      const business=e164(details.businessNumber);
      const matched=business?accounts.find(item=>e164(item.mightycall_number)===business):undefined;
      if(!matched){await rest(`mightycall_webhook_inbox?id=eq.${event.id}`,'PATCH',{client_route_attempted_at:new Date().toISOString()});continue;}
      await rest(`mightycall_webhook_inbox?id=eq.${event.id}`,'PATCH',{
        client_account_id:matched.id,caller_number:e164(details.caller?.phone),
        business_number:e164(details.businessNumber),call_status:details.callStatus||null,
        call_direction:details.direction||null,client_route_attempted_at:new Date().toISOString(),
        client_routed_at:new Date().toISOString(),
      });
    }catch{/* Keep the row available for the next poll. */}
  }
}
async function handle(job:Job) {
  const account=await load(job);if(!account)return 'cancelled';
  if(job.kind==='lead_followup') {
    if(!job.lead_id)return 'cancelled';
    const [lead,submission]=await Promise.all([
      row<Lead>('leads',`id=eq.${job.lead_id}&client_account_id=eq.${account.id}`),
      row<{id:string;data:Record<string,unknown>;form_id:string}>('form_submissions',`id=eq.${job.source_id}&client_account_id=eq.${account.id}`)]);
    if(!lead||!submission||lead.dnc||!lead.phone)return 'cancelled';
    const submittedPhone=Object.values(submission.data||{}).some(value=>e164(String(value))===e164(lead.phone));
    if(!submittedPhone)return 'cancelled';
    return await sendText(account,lead.phone,`Hi ${lead.first_name||'there'}, thanks for contacting ${account.name}. We received your request and will follow up shortly.`,job)?'sent':'cancelled';
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
    const leads=await rest<Lead[]>(`leads?client_account_id=eq.${account.id}&phone=ilike.*${encodeURIComponent(caller.slice(-10))}&select=id,dnc,phone,source,opt_in_source&limit=1`);
    if(leads[0]?.dnc)return 'cancelled';
    if(!leads[0])await rest('leads','POST',{client_account_id:account.id,
      first_name:'Caller',last_name:'',phone:caller,source:'missed_call',opt_in_source:'call',status:'new'});
    return await sendText(account,caller,`Sorry we missed your call to ${account.name}. How can we help?`,job)?'sent':'cancelled';
  }
  if(job.kind==='review_request') {
    if(!account.google_review_link||!/^https:\/\//.test(account.google_review_link))return 'cancelled';
    const appointment=await row<{guest_name:string;guest_phone:string;lead_id:string|null;status:string}>('booking_appointments',`id=eq.${job.source_id}&client_account_id=eq.${account.id}`);
    if(!appointment||appointment.status!=='completed')return 'cancelled';
    const lead=appointment.lead_id?await row<Lead>('leads',`id=eq.${appointment.lead_id}&client_account_id=eq.${account.id}`):null;
    if(!lead||lead.dnc||!lead.phone||!['form','call'].includes(lead.opt_in_source||lead.source||''))return 'cancelled';
    if(!await sendText(account,lead.phone,`Thanks for choosing ${account.name}. If you would like to share your experience, here is our review link: ${account.google_review_link}`,job))return 'cancelled';
    await rest('review_requests','POST',{client_account_id:account.id,contact_name:appointment.guest_name,
      contact_phone:lead.phone,channel:'sms',platform:'google',status:'sent',sent_at:new Date().toISOString()});
    return 'sent';
  }
  if(job.kind==='weekly_report') {
    const from=new Date(Date.now()-7*86400_000).toISOString();
    const [leads,calls,recipients]=await Promise.all([
      rest<Array<{id:string}>>(`leads?client_account_id=eq.${account.id}&created_at=gte.${encodeURIComponent(from)}&select=id`),
      rest<Array<{id:string;external_call_id:string;call_status:string}>>(`mightycall_webhook_inbox?client_account_id=eq.${account.id}&occurred_at=gte.${encodeURIComponent(from)}&select=id,external_call_id,call_status`),
      rest<Array<{email:string}>>(`report_recipients?client_account_id=eq.${account.id}&weekly=eq.true&active=eq.true&select=email`),
    ]);
    const emails=[...new Set([account.owner_email,...recipients.map(r=>r.email)].filter(Boolean))];
    if(!process.env.RESEND_API_KEY||!process.env.REPORT_FROM_EMAIL)throw Error('Report email is not configured');
    const uniqueCalls=new Set(calls.map(c=>c.external_call_id).filter(Boolean));
    const missedCalls=new Set(calls.filter(c=>c.call_status?.toLowerCase()==='missed').map(c=>c.external_call_id).filter(Boolean));
    const report=`${account.name} weekly report\n\nNew leads: ${leads.length}\nCalls logged: ${uniqueCalls.size}\nMissed calls: ${missedCalls.size}`;
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${process.env.RESEND_API_KEY}`,'content-type':'application/json','Idempotency-Key':job.id},
      body:JSON.stringify({from:process.env.REPORT_FROM_EMAIL,to:emails,subject:`${account.name} weekly report`,text:report}),signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error(`Report email ${response.status}`);
    await rest('report_sends','POST',{client_account_id:account.id,type:'weekly',period_start:from.slice(0,10),
      period_end:new Date().toISOString().slice(0,10),sent_at:new Date().toISOString(),recipients:emails,status:'sent'});
    return 'sent';
  }
  return 'cancelled';
}
async function read(req:IncomingMessage) {let text='';for await(const chunk of req){text+=chunk;if(text.length>2000)throw Error('Request too large')}return inputSchema.parse(JSON.parse(text||'{}'));}
function reply(res:ServerResponse,status:number,value:unknown){res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(value));}
export default async function handler(req:IncomingMessage,res:ServerResponse) {
  if(req.method!=='POST'&&req.method!=='GET')return reply(res,405,{error:'Method not allowed'});
  const secret=process.env.CRON_SECRET||process.env.OUTREACH_WORKER_TOKEN;
  const provided=String(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!secret||!provided||provided.length!==secret.length||
    !crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(secret)))return reply(res,401,{error:'Unauthorized'});
  let input:z.infer<typeof inputSchema>;
  try{input=req.method==='GET'?inputSchema.parse({}):await read(req)}catch{return reply(res,400,{error:'Invalid input'})}
  try {
    await routeCalls();
    const jobs=await rest<Job[]>('rpc/client_claim_jobs','POST',{p_limit:input.limit||5});
    const results=[];
    for(const job of jobs){
      try{const status=await handle(job);await rest(`client_automation_jobs?id=eq.${job.id}`,'PATCH',{status,sent_at:status==='sent'?new Date().toISOString():null,last_error:null,claimed_at:null});results.push({id:job.id,status});}
      catch(error){const message=error instanceof Error?error.message:String(error);
        await rest(`client_automation_jobs?id=eq.${job.id}`,'PATCH',{status:'failed',last_error:message.slice(0,500),claimed_at:null,run_at:new Date(Date.now()+Math.min(60,2**job.attempts)*60_000).toISOString()});
        if(job.attempts>=5&&process.env.SLACK_WEBHOOK_URL)await fetch(process.env.SLACK_WEBHOOK_URL,{method:'POST',
          headers:{'content-type':'application/json'},body:JSON.stringify({text:`VictorySync client automation failed: ${job.kind} for account ${job.client_account_id}, job ${job.id}`}),
          signal:AbortSignal.timeout(5000)}).catch(()=>undefined);
        results.push({id:job.id,status:'failed'});}
    }
    return reply(res,200,{results});
  }catch(error){return reply(res,500,{error:error instanceof Error?error.message:'Worker failed'})}
}
