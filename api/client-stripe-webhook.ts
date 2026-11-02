import crypto from 'node:crypto';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { z } from 'zod';
import {externalSendsEnabled} from '../lib/external-send-mode.js';

export const config={api:{bodyParser:false},maxDuration:60};
const checkout=z.object({id:z.string(),object:z.literal('checkout.session'),payment_status:z.string(),
  customer:z.string().nullable().optional(),
  customer_details:z.object({email:z.string().email().nullable().optional(),name:z.string().nullable().optional()}).nullable().optional(),
  metadata:z.object({company_id:z.string().uuid(),package:z.enum(['starter','scale','domination','overflow','business_hours','coverage_247','appt_part_time','appt_full_time','revive','custom']),owner_email:z.string().email().optional(),owner_name:z.string().optional()}).passthrough(),
}).passthrough();
const checkoutEventTypes=['checkout.session.completed','checkout.session.async_payment_succeeded'] as const;
const eventSchema=z.object({id:z.string(),type:z.enum(checkoutEventTypes),data:z.object({object:checkout})}).passthrough();
const envelopeSchema=z.object({id:z.string(),type:z.string()}).passthrough();
function reply(res:ServerResponse,status:number,value:unknown){res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(value))}
async function raw(req:IncomingMessage){
  const chunks:Buffer[]=[];let length=0;
  for await(const chunk of req){
    const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    length+=bytes.length;
    if(length>100_000)throw Error('Request too large');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
export function verifyStripeSignature(payload:Buffer,signature:string,secret:string,now=Date.now()){
  const fields=signature.split(',').map(part=>part.trim().split('=',2));
  const timestamp=Number(fields.find(([key])=>key==='t')?.[1]);
  const macs=fields.filter(([key])=>key==='v1').map(([,value])=>value);
  if(!Number.isSafeInteger(timestamp)||Math.abs(now/1000-timestamp)>300||!macs.length)return false;
  const expected=crypto.createHmac('sha256',secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`),payload])).digest();
  return macs.some(mac=>{
    if(!/^[0-9a-f]{64}$/i.test(mac||''))return false;
    const actual=Buffer.from(mac,'hex');
    return crypto.timingSafeEqual(actual,expected);
  });
}
async function rest<T>(path:string,body:unknown,method='POST'):Promise<T>{
  const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY;
  if(!base||!key)throw Error('Supabase service key missing');
  const response=await fetch(`${base}/rest/v1/${path}`,{method,headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',prefer:'return=representation'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>null) as T|{message?:string};
  if(!response.ok)throw Error(data&&typeof data==='object'&&'message'in data?String(data.message):`Database ${response.status}`);
  return data as T;
}
export default async function handler(req:IncomingMessage,res:ServerResponse){
  if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
  if(!externalSendsEnabled())return reply(res,503,{error:'Checkout webhook is disabled outside production or in sandbox mode'});
  const secret=process.env.STRIPE_WEBHOOK_SECRET;
  if(!secret)return reply(res,503,{error:'Stripe webhook is not configured'});
  try{
    const payload=await raw(req);
    const signature=String(req.headers['stripe-signature']||'');
    if(!verifyStripeSignature(payload,signature,secret))return reply(res,400,{error:'Invalid signature'});
    const event=envelopeSchema.parse(JSON.parse(payload.toString('utf8')));
    if(event.type!=='checkout.session.completed'&&event.type!=='checkout.session.async_payment_succeeded')
      return reply(res,200,{received:true});
    const parsed=eventSchema.parse(event);
    const session=parsed.data.object;
    if(session.payment_status!=='paid')return reply(res,200,{received:true,pendingPayment:true});
    const email=session.metadata.owner_email||session.customer_details?.email||'';
    const name=session.metadata.owner_name||session.customer_details?.name||'';
    if(!email||!name)return reply(res,422,{error:'Checkout requires owner name and email'});
    await rest(`companies?id=eq.${session.metadata.company_id}`,{stage:'client'},'PATCH');
    const created=await rest<{accountId:string;inviteCode?:string;existing:boolean}>('rpc/portal_create_client',{
      p_company:session.metadata.company_id,p_package:session.metadata.package,
      p_owner_email:email,p_owner_name:name});
    if(session.customer)await rest(`sub_accounts?id=eq.${created.accountId}`,{stripe_customer_id:session.customer},'PATCH');
    if(!created.existing&&created.inviteCode){
      const from=process.env.INVITE_FROM_EMAIL,key=process.env.RESEND_API_KEY,origin=process.env.APP_URL;
      if(!from||!key||!origin)throw Error('Invite email is not configured');
      const url=new URL('/login',origin);
      url.searchParams.set('invite',created.inviteCode);url.searchParams.set('email',email);url.searchParams.set('name',name);
      const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
        body:JSON.stringify({from,to:[email],subject:'Your VictorySync client portal invite',
          text:`${name}, your client portal is ready. Create your password here: ${url.toString()}\n\nThis invitation expires in seven days.`}),
        signal:AbortSignal.timeout(15000)});
      if(!sent.ok)throw Error(`Invite email failed (${sent.status})`);
      await rest('rpc/portal_mark_invite_sent',{p_account:created.accountId});
    }
    if(process.env.SLACK_WEBHOOK_URL)await fetch(process.env.SLACK_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({text:`VictorySync client checkout completed: ${name} (${session.metadata.package})`}),signal:AbortSignal.timeout(5000)}).catch(()=>undefined);
    return reply(res,200,{received:true,accountId:created.accountId});
  }catch(error){
    if(error instanceof z.ZodError||error instanceof SyntaxError)return reply(res,400,{error:'Invalid checkout event'});
    return reply(res,500,{error:error instanceof Error?error.message:'Checkout processing failed'});
  }
}
