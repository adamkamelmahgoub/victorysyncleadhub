import type {IncomingMessage,ServerResponse} from 'node:http';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {mcpPool} from '../mcp-auth.js';
import {socialActor,assertSocialPermission,isSocialOwner,SOCIAL_WORKSPACE_ORG_ID} from '../social-workspace-auth.js';
import {socialVaultRead,socialVaultWrite} from '../social-vault.js';
import {socialRest} from '../social-service.js';
import {getUnipileConfig,normalizeUnipileDsn,normalizeV1UnipileMessage,requestUnipile,unipileRequest} from '../social-unipile-client.js';
import {readSocialJsonBody} from '../social-request-body.js';

const org=SOCIAL_WORKSPACE_ORG_ID;
const json=(res:ServerResponse,status:number,value:unknown)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(value));};
async function origin(){
  const result=await mcpPool.query<{decrypted_secret:string}>("select decrypted_secret from vault.decrypted_secrets where name='victorysync_leadgen_origin' limit 1");
  const base=result.rows[0]?.decrypted_secret;
  if(!base||!/^https:\/\/[a-z0-9.-]+$/i.test(base))throw new Error('Application origin is not configured');
  return base;
}
function authLink(result:Record<string,unknown>){return String(result.url||(result.data as Record<string,unknown>|undefined)?.link||'');}
function hostedBody(version:'v1'|'v2',kind:'create'|'reconnect',platform:string,externalId:string|null,callbackUrl:string,state:string,dsn:string|null,base:string){
  if(version==='v1')return {type:kind,api_url:dsn,expiresOn:new Date(Date.now()+15*60_000).toISOString(),
    ...(kind==='create'?{providers:[platform.toUpperCase()]}:{reconnect_account:externalId}),
    notify_url:`${callbackUrl.replace('action=callback','action=notify')}&state=${encodeURIComponent(state)}`,
    success_redirect_url:`${base}/settings?unipile_connect=pending`,failure_redirect_url:`${base}/settings?unipile_connect=failed`,name:state};
  return {...(kind==='create'?{providers:platform}:{account_id:externalId}),expires_on:new Date(Date.now()+15*60_000).toISOString(),
    redirect_uri:`${callbackUrl}&state=${encodeURIComponent(state)}`};
}
async function finishConnection(state:string,externalId:string){
  if(!/^[a-zA-Z0-9_-]{30,100}$/.test(state)||!externalId||externalId.length>300)return 'cancelled';
  const claimed=await mcpPool.query<{account_id:string;platform:string;rep_user_id:string}>(`update public.social_unipile_connect_attempts set completed_at=now(),updated_at=now()
    where state_hash=$1 and organization_id=$2 and completed_at is null and expires_at>now()
    returning account_id,platform,rep_user_id`,[createHash('sha256').update(state).digest('hex'),org]);
  const attempt=claimed.rows[0];if(!attempt)return 'expired';
  try{
    const account=await unipileRequest(org,`/accounts/${encodeURIComponent(externalId)}`);
    const provider=String(account.provider||account.type||'').toLowerCase();
    if(provider!==attempt.platform||String(account.id||'')!==externalId)return 'provider_mismatch';
    const userId=String(account.user_id||''),handle=String(account.name||'').slice(0,200);
    const status=['running','ok'].includes(String(account.status||'').toLowerCase())?'active':'error';
    await mcpPool.query(`update public.connected_accounts set external_account_id=$1,connected_provider_user_id=$2,connected_handle=$3,
      username=$3,label=$4,status=$5,health=$6,last_error=null,updated_at=now() where id=$7 and organization_id=$8 and owner_user_id=$9`,
      [externalId,userId||null,handle||null,handle||`${attempt.platform} account`,status,status==='active'?'healthy':'warning',attempt.account_id,org,attempt.rep_user_id]);
    await mcpPool.query(`insert into public.social_unipile_sync_state(connected_account_id,organization_id,next_sync_at)
      values($1,$2,now()) on conflict(connected_account_id) do update set chat_cursor=null,
      initial_sync_complete=false,next_sync_at=now(),updated_at=now()`,[attempt.account_id,org]);
    await mcpPool.query(`insert into public.social_workspace_audit(organization_id,actor_id,action,target_type,target_id)
      values($1,$2,'unipile_account_connected','connected_account',$3)`,[org,attempt.rep_user_id,attempt.account_id]);
    return status==='active'?'connected':'needs_attention';
  }catch{return 'connection_failed';}
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
  const found=await mcpPool.query<{webhook_secret_vault_id:string|null;api_version:'v1'|'v2'}>(`select webhook_secret_vault_id,api_version from public.social_unipile_config where organization_id=$1`,[org]);
  if(!found.rows[0]?.webhook_secret_vault_id)return json(res,503,{error:'Webhook secret is not configured'});
  const secret=await socialVaultRead(found.rows[0].webhook_secret_vault_id);
  if(found.rows[0].api_version==='v1'){
    const header=req.headers['unipile-auth'];const value=Array.isArray(header)?header[0]:header||'';
    const received=Buffer.from(value),expected=Buffer.from(secret);
    if(received.length!==expected.length||!timingSafeEqual(received,expected))return json(res,401,{error:'Invalid webhook authorization'});
  }else{
    const header=req.headers['unipile-signature'];
    if(!verifyUnipileSignature(raw,Array.isArray(header)?header[0]:header,secret))return json(res,401,{error:'Invalid signature'});
  }
  const received=JSON.parse(raw.toString('utf8')) as Record<string,unknown>;
  const status=received.AccountStatus as Record<string,unknown>|undefined;
  const event=found.rows[0].api_version==='v1'?
    received.event==='message_received'?normalizeV1UnipileMessage(received):
    status?{account_id:status.account_id,type:`account.status.${status.message==='OK'?'running':'errored'}`,payload:{reason:status.message}}:null:received;
  if(!event)return json(res,200,{received:true,ignored:true});
  const accountId=String(event.account_id||'');
  const id=found.rows[0].api_version==='v1'?`v1:${accountId}:${String(received.message_id||createHash('sha256').update(raw).digest('hex'))}`:String((event as Record<string,unknown>).id||'');
  if(!accountId||accountId.length>200||!/^[-:\w]{1,240}$/.test(id))return json(res,400,{error:'Invalid event'});
  const accounts=await mcpPool.query(`select id from public.connected_accounts where organization_id=$1 and provider='unipile' and external_account_id=$2`,[org,accountId]);
  if(!accounts.rowCount)return json(res,403,{error:'Unknown account'});
  const inbox=await socialRest<Array<{id:number}>>('webhook_inbox',{method:'POST',body:JSON.stringify({provider:'unipile',method:'POST',content_type:req.headers['content-type']||null,
    raw_text:raw.toString('utf8'),parsed:received,headers:{authentication:'[verified]'},query:{}})});
  await socialRest('social_webhook_events?on_conflict=provider,event_key',{method:'POST',headers:{prefer:'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify({provider:'unipile',inbox_id:inbox[0].id,event_key:id,payload:event})});
  return json(res,200,{received:true});
}
async function callback(res:ServerResponse,url:URL){
  const base=await origin();
  const redirect=(result:string)=>{res.statusCode=302;res.setHeader('location',`${base}/settings?unipile_connect=${result}`);res.end();};
  return redirect(await finishConnection(url.searchParams.get('state')||'',url.searchParams.get('account_id')||''));
}
async function registerV1Webhook(webhookUrl:string){
  const secret=randomBytes(32).toString('base64url');
  await unipileRequest(org,'/webhooks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    request_url:webhookUrl,source:'messaging',headers:[{key:'Content-Type',value:'application/json'},{key:'Unipile-Auth',value:secret}],
  })});
  const vaultId=await socialVaultWrite(`victorysync_unipile_webhook_${org}`,secret,'Unipile V1 webhook authentication header');
  await mcpPool.query(`update public.social_unipile_config set webhook_secret_vault_id=$1,updated_at=now() where organization_id=$2`,[vaultId,org]);
}
export default async function handler(req:IncomingMessage,res:ServerResponse){
  try{
    const url=new URL(req.url||'/','https://local.invalid');
    if(req.method==='GET'&&url.searchParams.get('action')==='callback')return await callback(res,url);
    if(req.method==='POST'&&url.searchParams.get('action')==='notify'){
      const input=await readSocialJsonBody(req,10000);
      const result=await finishConnection(url.searchParams.get('state')||'',String(input.account_id||''));
      return json(res,result==='connected'||result==='needs_attention'?200:400,{result});
    }
    if(url.searchParams.get('action')==='webhook')return await webhook(req,res);
    const actor=await socialActor(req);assertSocialPermission(actor,org,'accounts_manage');
    const base=await origin(),callbackUrl=`${base}/api/social-unipile?action=callback`,webhookUrl=`${base}/api/social-unipile?action=webhook`;
    if(req.method==='GET'){
      const found=await mcpPool.query<{api_version:string;api_base_url:string|null}>('select api_version,api_base_url from public.social_unipile_config where organization_id=$1',[org]);
      const secret=await mcpPool.query(`select 1 from public.social_unipile_config where organization_id=$1 and webhook_secret_vault_id is not null`,[org]);
      return json(res,200,{configured:!!found.rowCount,api_version:found.rows[0]?.api_version||null,dsn:found.rows[0]?.api_base_url||null,webhook_configured:!!secret.rowCount,callback_url:callbackUrl,webhook_url:webhookUrl});
    }
    if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
    const input=await readSocialJsonBody(req,10000);
    if(input.action==='configure'){
      if(!isSocialOwner(actor,org))throw new Error('Owner access required');
      const key=String(input.api_key||'').trim();
      if(key.length<20||key.length>1000)throw new Error('Enter a valid Unipile API key');
      const dsn=normalizeUnipileDsn(String(input.dsn||''));
      await requestUnipile({api_key_vault_id:'',api_base_url:dsn,api_version:'v1'},key,'/accounts?limit=1');
      const vaultId=await socialVaultWrite(`victorysync_unipile_api_${org}`,key,'Unipile API key');
      await mcpPool.query(`insert into public.social_unipile_config(organization_id,api_key_vault_id,api_base_url,api_version,configured_by) values($1,$2,$3,'v1',$4)
        on conflict(organization_id) do update set api_key_vault_id=excluded.api_key_vault_id,api_base_url=excluded.api_base_url,
        api_version='v1',webhook_secret_vault_id=null,configured_by=excluded.configured_by,updated_at=now()`,[org,vaultId,dsn,actor.id]);
      let webhookConfigured=false;
      try{await registerV1Webhook(webhookUrl);webhookConfigured=true;}catch{/* Polling remains available; UI offers a retry. */}
      return json(res,200,{configured:true,api_version:'v1',webhook_configured:webhookConfigured});
    }
    if(input.action==='register_webhook'){
      if(!isSocialOwner(actor,org))throw new Error('Owner access required');
      if((await getUnipileConfig(org)).api_version!=='v1')throw new Error('Automatic webhook setup requires a DSN connection');
      await registerV1Webhook(webhookUrl);
      return json(res,200,{webhook_configured:true});
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
      const config=await getUnipileConfig(org),state=randomBytes(32).toString('base64url');
      await mcpPool.query(`insert into public.social_unipile_connect_attempts(organization_id,account_id,rep_user_id,platform,state_hash,expires_at)
        values($1,$2,$3,$4,$5,now()+interval '15 minutes')`,[org,id,target.owner_user_id,target.platform,createHash('sha256').update(state).digest('hex')]);
      const result=await unipileRequest(org,config.api_version==='v1'?'/hosted/accounts/link':'/auth/link',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(hostedBody(config.api_version,'reconnect',target.platform,
          target.external_account_id,callbackUrl,state,config.api_base_url,base))});
      const link=authLink(result);
      if(!/^https:\/\//.test(link))throw new Error('Unipile did not return an authorization link');
      return json(res,200,{authorization_url:link});
    }
    if(input.action==='start'){
      const platform=String(input.platform||'');
      if(!['instagram','linkedin'].includes(platform))throw new Error('Choose Instagram or LinkedIn');
      if(input.consent!==true)throw new Error('Account owner consent is required');
      const config=await getUnipileConfig(org);
      const state=randomBytes(32).toString('base64url');
      {
        const result=await unipileRequest(org,config.api_version==='v1'?'/hosted/accounts/link':'/auth/link',{
          method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(hostedBody(config.api_version,'create',platform,null,
            callbackUrl,state,config.api_base_url,base))});
        const link=authLink(result);
        if(!/^https:\/\//.test(link))throw new Error('Unipile did not return an authorization link');
        const account=await mcpPool.query<{id:string}>(`insert into public.connected_accounts
          (organization_id,platform,display_platform,connection_mode,provider,label,status,health,created_by,owner_user_id,consent_signed_at,consent_version)
          values($1,$2,$2,'unipile','unipile',$3,'error','warning',$4,$4,now(),'2026-10-21') returning id`,
          [org,platform,`${platform} connection pending`,actor.id]);
        const id=account.rows[0].id;
        await mcpPool.query(`insert into public.social_unipile_connect_attempts(organization_id,account_id,rep_user_id,platform,state_hash,expires_at)
          values($1,$2,$3,$4,$5,now()+interval '15 minutes')`,[org,id,actor.id,platform,createHash('sha256').update(state).digest('hex')]);
        return json(res,200,{authorization_url:link});
      }
    }
    throw new Error('Invalid action');
  }catch(error){return json(res,400,{error:error instanceof Error?error.message:'Unipile connection failed'});}
}
