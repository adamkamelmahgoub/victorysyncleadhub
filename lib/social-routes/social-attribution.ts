import type {IncomingMessage,ServerResponse} from 'node:http';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {mcpPool} from '../mcp-auth.js';
import {socialRest} from '../social-service.js';
import {socialActor,isSocialOwner,SOCIAL_WORKSPACE_ORG_ID} from '../social-workspace-auth.js';
import {socialVaultRead,socialVaultWrite} from '../social-vault.js';

const org=SOCIAL_WORKSPACE_ORG_ID;
const send=(res:ServerResponse,status:number,value:unknown)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(value));};
export function verifyAttributionSignature(provider:'calendly'|'stripe',raw:Buffer,header:string|undefined,secret:string,now=Date.now()){
  if(!header)return false;
  const fields=header.split(',').map(part=>part.trim().split('='));
  const timestamp=fields.find(([key])=>key==='t')?.[1];
  const signatures=fields.filter(([key])=>key==='v1').map(([,value])=>value);
  if(!timestamp||!/^\d{10}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300)return false;
  const expected=createHmac('sha256',secret).update(`${timestamp}.${raw.toString('utf8')}`).digest();
  return signatures.some(value=>/^[0-9a-f]{64}$/i.test(value)&&timingSafeEqual(expected,Buffer.from(value,'hex')));
}
async function origin(){
  const result=await mcpPool.query<{decrypted_secret:string}>("select decrypted_secret from vault.decrypted_secrets where name='victorysync_leadgen_origin' limit 1");
  const base=result.rows[0]?.decrypted_secret;
  if(!base||!/^https:\/\/[a-z0-9.-]+$/i.test(base))throw new Error('Application origin is not configured');
  return base;
}
async function webhook(req:IncomingMessage,res:ServerResponse,provider:'calendly'|'stripe'){
  if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
  const chunks:Buffer[]=[];let size=0;
  for await(const item of req){const part=Buffer.isBuffer(item)?item:Buffer.from(item);size+=part.length;if(size>1024*1024)return send(res,413,{error:'Payload too large'});chunks.push(part);}
  const raw=Buffer.concat(chunks);
  const column=provider==='calendly'?'calendly_signing_vault_id':'stripe_signing_vault_id';
  const configured=await mcpPool.query<{vault_id:string}>(`select ${column} vault_id from public.social_attribution_secrets where organization_id=$1`,[org]);
  if(!configured.rows[0]?.vault_id)return send(res,503,{error:'Webhook signing key is not configured'});
  const secret=await socialVaultRead(configured.rows[0].vault_id);
  const signature=req.headers[provider==='calendly'?'calendly-webhook-signature':'stripe-signature'];
  if(!verifyAttributionSignature(provider,raw,Array.isArray(signature)?signature[0]:signature,secret))return send(res,401,{error:'Invalid signature'});
  const event=JSON.parse(raw.toString('utf8')) as Record<string,unknown>;
  const key=provider==='stripe'?String(event.id||''):createHash('sha256').update(raw).digest('hex');
  if(!key||key.length>200)return send(res,400,{error:'Invalid event'});
  const inbox=await socialRest<Array<{id:number}>>('webhook_inbox',{method:'POST',body:JSON.stringify({provider,method:'POST',content_type:req.headers['content-type']||null,
    raw_text:raw.toString('utf8'),parsed:event,headers:{[provider==='calendly'?'calendly-webhook-signature':'stripe-signature']:'[verified]'},query:{}})});
  await socialRest('social_webhook_events?on_conflict=provider,event_key',{method:'POST',headers:{prefer:'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify({provider,organization_id:org,inbox_id:inbox[0].id,event_key:key,payload:event})});
  return send(res,200,{received:true});
}
export default async function handler(req:IncomingMessage,res:ServerResponse){
  try{
    const url=new URL(req.url||'/','https://local.invalid');
    if(url.searchParams.get('action')==='webhook'){
      const provider=url.searchParams.get('provider');
      if(provider!=='calendly'&&provider!=='stripe')return send(res,400,{error:'Invalid provider'});
      return await webhook(req,res,provider);
    }
    const actor=await socialActor(req);if(!isSocialOwner(actor,org))throw new Error('Owner access required');
    const base=await origin();
    if(req.method==='GET'){
      const result=await mcpPool.query<{calendly:boolean;stripe:boolean}>(`select calendly_signing_vault_id is not null calendly,
        stripe_signing_vault_id is not null stripe from public.social_attribution_secrets where organization_id=$1`,[org]);
      return send(res,200,{calendly_configured:result.rows[0]?.calendly||false,stripe_configured:result.rows[0]?.stripe||false,
        calendly_webhook_url:`${base}/api/social-attribution?action=webhook&provider=calendly`,
        stripe_webhook_url:`${base}/api/social-attribution?action=webhook&provider=stripe`});
    }
    if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
    let raw='';for await(const part of req){raw+=part;if(raw.length>10000)throw new Error('Request too large');}
    const data=JSON.parse(raw||'{}') as Record<string,unknown>;
    const provider=String(data.provider||''),secret=String(data.signing_secret||'').trim();
    if(!['calendly','stripe'].includes(provider)||secret.length<16||secret.length>1000)throw new Error('Choose a provider and valid signing secret');
    const vaultId=await socialVaultWrite(`victorysync_${provider}_dm_webhook_${org}`,secret,`${provider} DM attribution webhook secret`);
    const column=provider==='calendly'?'calendly_signing_vault_id':'stripe_signing_vault_id';
    await mcpPool.query(`insert into public.social_attribution_secrets(organization_id,${column},configured_by) values($1,$2,$3)
      on conflict(organization_id) do update set ${column}=excluded.${column},configured_by=excluded.configured_by,updated_at=now()`,[org,vaultId,actor.id]);
    return send(res,200,{configured:true});
  }catch(error){return send(res,400,{error:error instanceof Error?error.message:'Attribution setup failed'});}
}
