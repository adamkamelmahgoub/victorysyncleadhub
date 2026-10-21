import type {IncomingMessage,ServerResponse} from 'node:http';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {mcpPool} from '../mcp-auth.js';
import {socialActor,assertSocialPermission,isSocialOwner,SOCIAL_WORKSPACE_ORG_ID} from '../social-workspace-auth.js';
import {socialVaultRead,socialVaultWrite} from '../social-vault.js';
import {socialRest} from '../social-service.js';

const org=SOCIAL_WORKSPACE_ORG_ID;
const json=(res:ServerResponse,status:number,value:unknown)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(value));};
async function origin(){
  const result=await mcpPool.query<{decrypted_secret:string}>("select decrypted_secret from vault.decrypted_secrets where name='victorysync_leadgen_origin' limit 1");
  const base=result.rows[0]?.decrypted_secret;
  if(!base||!/^https:\/\/[a-z0-9.-]+$/i.test(base))throw new Error('Application origin is not configured');
  return base;
}
async function config(){
  const result=await mcpPool.query<{api_key_vault_id:string}>(`select api_key_vault_id from public.social_unipile_config where organization_id=$1`,[org]);
  if(!result.rows[0])throw new Error('Save the Unipile API key first');
  return result.rows[0];
}
async function unipile(path:string,key:string,init?:RequestInit){
  const response=await fetch(`https://api.unipile.com/v2${path}`,{...init,headers:{'X-API-KEY':key,'content-type':'application/json',...init?.headers},signal:AbortSignal.timeout(15000)});
  if(!response.ok){const detail=await response.text().catch(()=> '');throw new Error(`Unipile request failed (${response.status})${detail?`: ${detail.slice(0,300)}`:''}`);}
  return response.json() as Promise<Record<string,unknown>>;
}
export function verifyUnipileSignature(raw:Buffer,header:string|undefined,secret:string,now=Date.now()){
  const fields=Object.fromEntries((header||'').split(',').map(part=>part.trim().split('=')));
  const timestamp=Number(fields.t),received=fields.v0;
  if(!/^\d{10}$/.test(fields.t||'')||!received||!isFinite(timestamp)||Math.abs(now/1000-timestamp)>300||!/^[0-9a-f]{64}$/i.test(received))return false;
  const expected=createHmac('sha256',secret).update(`${fields.t}.${raw.toString('utf8')}`).digest();
  return timingSafeEqual(expected,Buffer.from(received,'hex'));
}
async function webhook(req:IncomingMessage,res:ServerResponse){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  const chunks:Buffer[]=[];let size=0;
  for await(const piece of req){const part=Buffer.isBuffer(piece)?piece:Buffer.from(piece);size+=part.length;if(size>1024*1024)return json(res,413,{error:'Payload too large'});chunks.push(part);}
  const raw=Buffer.concat(chunks);
  const found=await mcpPool.query<{webhook_secret_vault_id:string|null}>(`select webhook_secret_vault_id from public.social_unipile_config where organization_id=$1`,[org]);
  if(!found.rows[0]?.webhook_secret_vault_id)return json(res,503,{error:'Webhook secret is not configured'});
  const secret=await socialVaultRead(found.rows[0].webhook_secret_vault_id);
  const header=req.headers['unipile-signature'];
  if(!verifyUnipileSignature(raw,Array.isArray(header)?header[0]:header,secret))return json(res,401,{error:'Invalid signature'});
  const event=JSON.parse(raw.toString('utf8')) as Record<string,unknown>;
  const id=String(event.id||''),accountId=String(event.account_id||'');
  if(!/^evt_[a-zA-Z0-9_-]{1,200}$/.test(id)||!/^acc_[a-zA-Z0-9_-]{1,200}$/.test(accountId))return json(res,400,{error:'Invalid event'});
  const accounts=await mcpPool.query(`select id from public.connected_accounts where organization_id=$1 and provider='unipile' and external_account_id=$2`,[org,accountId]);
  if(!accounts.rowCount)return json(res,403,{error:'Unknown account'});
  const inbox=await socialRest<Array<{id:number}>>('webhook_inbox',{method:'POST',body:JSON.stringify({provider:'unipile',method:'POST',content_type:req.headers['content-type']||null,
    raw_text:raw.toString('utf8'),parsed:event,headers:{'unipile-signature':'[verified]'},query:{}})});
  await socialRest('social_webhook_events?on_conflict=provider,event_key',{method:'POST',headers:{prefer:'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify({provider:'unipile',inbox_id:inbox[0].id,event_key:id,payload:event})});
  return json(res,200,{received:true});
}
async function callback(res:ServerResponse,url:URL){
  const base=await origin();
  const redirect=(result:string)=>{res.statusCode=302;res.setHeader('location',`${base}/settings?unipile_connect=${result}`);res.end();};
  const state=url.searchParams.get('state')||'',externalId=url.searchParams.get('account_id')||'';
  if(!/^[a-zA-Z0-9_-]{30,100}$/.test(state)||!externalId||externalId.length>300)return redirect('cancelled');
  const claimed=await mcpPool.query<{account_id:string;platform:string;rep_user_id:string}>(`update public.social_unipile_connect_attempts set completed_at=now(),updated_at=now()
    where state_hash=$1 and organization_id=$2 and completed_at is null and expires_at>now()
    returning account_id,platform,rep_user_id`,[createHash('sha256').update(state).digest('hex'),org]);
  const attempt=claimed.rows[0];if(!attempt)return redirect('expired');
  try{
    const key=await socialVaultRead((await config()).api_key_vault_id);
    const account=await unipile(`/accounts/${encodeURIComponent(externalId)}`,key);
    const provider=String(account.provider||'').toLowerCase();
    if(provider!==attempt.platform||String(account.id||'')!==externalId)return redirect('provider_mismatch');
    const userId=String(account.user_id||'');
    const handle=String(account.name||'').slice(0,200);
    const status=String(account.status||'').toLowerCase()==='running'?'active':'error';
    await mcpPool.query(`update public.connected_accounts set external_account_id=$1,connected_provider_user_id=$2,connected_handle=$3,
      username=$3,label=$4,status=$5,health=$6,last_error=null,updated_at=now() where id=$7 and organization_id=$8 and owner_user_id=$9`,
      [externalId,userId||null,handle||null,handle||`${attempt.platform} account`,status,status==='active'?'healthy':'warning',attempt.account_id,org,attempt.rep_user_id]);
    await mcpPool.query(`insert into public.social_unipile_sync_state(connected_account_id,organization_id,next_sync_at)
      values($1,$2,now()) on conflict(connected_account_id) do update set chat_cursor=null,
      initial_sync_complete=false,next_sync_at=now(),updated_at=now()`,[attempt.account_id,org]);
    await mcpPool.query(`insert into public.social_workspace_audit(organization_id,actor_id,action,target_type,target_id)
      values($1,$2,'unipile_account_connected','connected_account',$3)`,[org,attempt.rep_user_id,attempt.account_id]);
    return redirect(status==='active'?'connected':'needs_attention');
  }catch{return redirect('connection_failed');}
}
export default async function handler(req:IncomingMessage,res:ServerResponse){
  try{
    const url=new URL(req.url||'/','https://local.invalid');
    if(req.method==='GET'&&url.searchParams.get('action')==='callback')return await callback(res,url);
    if(url.searchParams.get('action')==='webhook')return await webhook(req,res);
    const actor=await socialActor(req);assertSocialPermission(actor,org,'accounts_manage');
    const base=await origin(),callbackUrl=`${base}/api/social-unipile?action=callback`,webhookUrl=`${base}/api/social-unipile?action=webhook`;
    if(req.method==='GET'){
      const found=await mcpPool.query('select 1 from public.social_unipile_config where organization_id=$1',[org]);
      const secret=await mcpPool.query(`select 1 from public.social_unipile_config where organization_id=$1 and webhook_secret_vault_id is not null`,[org]);
      return json(res,200,{configured:!!found.rowCount,webhook_configured:!!secret.rowCount,callback_url:callbackUrl,webhook_url:webhookUrl});
    }
    if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
    let raw='';for await(const part of req){raw+=part;if(raw.length>10000)throw new Error('Request too large');}
    const input=JSON.parse(raw||'{}') as Record<string,unknown>;
    if(input.action==='configure'){
      if(!isSocialOwner(actor,org))throw new Error('Owner access required');
      const key=String(input.api_key||'').trim();
      if(key.length<20||key.length>1000)throw new Error('Enter a valid Unipile API key');
      const vaultId=await socialVaultWrite(`victorysync_unipile_api_${org}`,key,'Unipile API key');
      await mcpPool.query(`insert into public.social_unipile_config(organization_id,api_key_vault_id,configured_by) values($1,$2,$3)
        on conflict(organization_id) do update set api_key_vault_id=excluded.api_key_vault_id,configured_by=excluded.configured_by,updated_at=now()`,[org,vaultId,actor.id]);
      return json(res,200,{configured:true});
    }
    if(input.action==='webhook_secret'){
      if(!isSocialOwner(actor,org))throw new Error('Owner access required');
      const secret=String(input.secret||'').trim();if(secret.length<16||secret.length>1000)throw new Error('Enter the webhook signing secret');
      const vaultId=await socialVaultWrite(`victorysync_unipile_webhook_${org}`,secret,'Unipile webhook signing secret');
      await mcpPool.query(`update public.social_unipile_config set webhook_secret_vault_id=$1,updated_at=now() where organization_id=$2`,[vaultId,org]);
      return json(res,200,{webhook_configured:true});
    }
    if(input.action==='reconnect'){
      const id=String(input.account_id||'');if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid account');
      const account=await mcpPool.query<{platform:string;external_account_id:string;owner_user_id:string}>(`select platform,external_account_id,owner_user_id
        from public.connected_accounts where id=$1 and organization_id=$2 and provider='unipile'`,[id,org]);
      const target=account.rows[0];
      if(!target||!target.external_account_id||(!isSocialOwner(actor,org)&&target.owner_user_id!==actor.id))throw new Error('Account owner access required');
      const key=await socialVaultRead((await config()).api_key_vault_id),state=randomBytes(32).toString('base64url');
      await mcpPool.query(`insert into public.social_unipile_connect_attempts(organization_id,account_id,rep_user_id,platform,state_hash,expires_at)
        values($1,$2,$3,$4,$5,now()+interval '15 minutes')`,[org,id,target.owner_user_id,target.platform,createHash('sha256').update(state).digest('hex')]);
      const result=await unipile('/auth/link',key,{method:'POST',body:JSON.stringify({account_id:target.external_account_id,
        expires_on:new Date(Date.now()+15*60_000).toISOString(),redirect_uri:callbackUrl,state})});
      const link=String((result.data as Record<string,unknown>|undefined)?.link||'');
      if(!/^https:\/\//.test(link))throw new Error('Unipile did not return an authorization link');
      return json(res,200,{authorization_url:link});
    }
    if(input.action==='start'){
      const platform=String(input.platform||'');
      if(!['instagram','linkedin'].includes(platform))throw new Error('Choose Instagram or LinkedIn');
      if(input.consent!==true)throw new Error('Account owner consent is required');
      const key=await socialVaultRead((await config()).api_key_vault_id);
      const state=randomBytes(32).toString('base64url');
      const account=await mcpPool.query<{id:string}>(`insert into public.connected_accounts
        (organization_id,platform,display_platform,connection_mode,provider,label,status,health,created_by,owner_user_id,consent_signed_at,consent_version)
        values($1,$2,$2,'unipile','unipile',$3,'error','warning',$4,$4,now(),'2026-10-21') returning id`,
        [org,platform,`${platform} connection pending`,actor.id]);
      const id=account.rows[0].id;
      await mcpPool.query(`insert into public.social_unipile_connect_attempts(organization_id,account_id,rep_user_id,platform,state_hash,expires_at)
        values($1,$2,$3,$4,$5,now()+interval '15 minutes')`,[org,id,actor.id,platform,createHash('sha256').update(state).digest('hex')]);
      try{
        const result=await unipile('/auth/link',key,{method:'POST',body:JSON.stringify({providers:platform,expires_on:new Date(Date.now()+15*60_000).toISOString(),redirect_uri:callbackUrl,state})});
        const data=result.data as Record<string,unknown>|undefined;
        const link=String(data?.link||'');
        if(!/^https:\/\//.test(link))throw new Error('Unipile did not return an authorization link');
        return json(res,200,{authorization_url:link});
      }catch(error){await mcpPool.query('update public.connected_accounts set last_error=$1 where id=$2',[error instanceof Error?error.message:'Connection failed',id]);throw error;}
    }
    throw new Error('Invalid action');
  }catch(error){return json(res,400,{error:error instanceof Error?error.message:'Unipile connection failed'});}
}
