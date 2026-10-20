import type {IncomingMessage,ServerResponse} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {mcpPool} from '../mcp-auth.js';
import {socialActor,isSocialOwner,SOCIAL_WORKSPACE_ORG_ID} from '../social-workspace-auth.js';
import {socialVaultRead,socialVaultWrite} from '../social-vault.js';

const org=SOCIAL_WORKSPACE_ORG_ID;
const send=(res:ServerResponse,status:number,value:unknown)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(value));};
async function origin(){
  const result=await mcpPool.query<{decrypted_secret:string}>("select decrypted_secret from vault.decrypted_secrets where name='victorysync_leadgen_origin' limit 1");
  const base=result.rows[0]?.decrypted_secret;
  if(!base||!/^https:\/\/[a-z0-9.-]+$/i.test(base))throw new Error('Application origin is not configured');
  return base;
}
async function configuredApp(){
  const result=await mcpPool.query<{app_id:string;app_secret_vault_id:string}>('select app_id,app_secret_vault_id from public.social_threads_apps where organization_id=$1',[org]);
  if(!result.rows[0])throw new Error('Save the Threads app first');
  return result.rows[0];
}
async function callback(res:ServerResponse,url:URL){
  const base=await origin(),state=url.searchParams.get('state')||'',code=url.searchParams.get('code')||'';
  const redirect=(result:string)=>{res.statusCode=302;res.setHeader('location',`${base}/settings?threads_connect=${result}`);res.end();};
  if(!/^[a-zA-Z0-9_-]{30,100}$/.test(state)||!code||code.length>3000)return redirect('cancelled');
  const claimed=await mcpPool.query<{organization_id:string;user_id:string;redirect_uri:string}>(`update public.social_oauth_states set used_at=now()
    where state_hash=$1 and organization_id=$2 and redirect_uri=$3 and used_at is null and expires_at>now()
    returning organization_id,user_id,redirect_uri`,[createHash('sha256').update(state).digest('hex'),org,`${base}/api/social-threads-oauth?action=callback`]);
  if(!claimed.rows[0])return redirect('expired');
  const app=await configuredApp(),secret=await socialVaultRead(app.app_secret_vault_id);
  const exchange=await fetch('https://graph.threads.net/oauth/access_token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:app.app_id,client_secret:secret,code,grant_type:'authorization_code',redirect_uri:claimed.rows[0].redirect_uri}),signal:AbortSignal.timeout(15000)});
  if(!exchange.ok)return redirect('token_error');
  const short=await exchange.json() as{access_token?:string};
  if(!short.access_token)return redirect('token_error');
  const long=await fetch(`https://graph.threads.net/access_token?${new URLSearchParams({grant_type:'th_exchange_token',client_secret:secret})}`,{
    headers:{authorization:`Bearer ${short.access_token}`},signal:AbortSignal.timeout(15000)});
  if(!long.ok)return redirect('token_error');
  const token=await long.json() as{access_token?:string;expires_in?:number};
  if(!token.access_token||!token.expires_in)return redirect('token_error');
  const profileResponse=await fetch('https://graph.threads.net/me?fields=id,username',{headers:{authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(15000)});
  if(!profileResponse.ok)return redirect('profile_error');
  const profile=await profileResponse.json() as{id?:string;username?:string};
  if(!profile.id||!profile.username)return redirect('profile_error');
  const account=await mcpPool.query<{id:string}>(`insert into public.connected_accounts
    (organization_id,platform,display_platform,external_account_id,profile_url,connection_mode,label,username,status,created_by,scopes,token_expires_at)
    values($1,'threads','threads',$2,$3,'api',$4,$5,'active',$6,$7,now()+($8::int*interval '1 second'))
    on conflict(organization_id,platform,external_account_id) do update set status='active',connection_mode='api',label=excluded.label,
      username=excluded.username,profile_url=excluded.profile_url,token_expires_at=excluded.token_expires_at,last_error=null,updated_at=now() returning id`,
    [org,profile.id,`https://www.threads.net/@${profile.username}`,`@${profile.username}`,profile.username,claimed.rows[0].user_id,
      ['threads_basic','threads_content_publish','threads_manage_insights'],token.expires_in]);
  const id=account.rows[0].id,vaultId=await socialVaultWrite(`victorysync_social_account_${id}`,token.access_token,'Threads user access token');
  await mcpPool.query(`insert into public.connected_account_secrets(connected_account_id,vault_access_token_id) values($1,$2)
    on conflict(connected_account_id) do update set vault_access_token_id=excluded.vault_access_token_id,encrypted_access_token=null,updated_at=now()`,[id,vaultId]);
  await mcpPool.query(`insert into public.social_workspace_audit(organization_id,actor_id,action,target_type,target_id)
    values($1,$2,'threads_account_connected','connected_account',$3)`,[org,claimed.rows[0].user_id,id]);
  return redirect('connected');
}
export default async function handler(req:IncomingMessage,res:ServerResponse){
  try{
    const url=new URL(req.url||'/','https://local.invalid');
    if(req.method==='GET'&&url.searchParams.get('action')==='callback')return await callback(res,url);
    const actor=await socialActor(req);
    if(!isSocialOwner(actor,org))throw new Error('Owner access required');
    const base=await origin(),callbackUrl=`${base}/api/social-threads-oauth?action=callback`;
    if(req.method==='GET'){
      const result=await mcpPool.query<{app_id:string}>('select app_id from public.social_threads_apps where organization_id=$1',[org]);
      return send(res,200,{configured:!!result.rows[0],app_id:result.rows[0]?.app_id||'',callback_url:callbackUrl});
    }
    if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
    let raw='';for await(const part of req){raw+=part;if(raw.length>10000)throw new Error('Request too large');}
    const input=JSON.parse(raw||'{}') as Record<string,unknown>;
    if(input.action==='configure'){
      const appId=String(input.app_id||'').trim(),secret=String(input.app_secret||'');
      if(!/^\d{5,30}$/.test(appId)||secret.length<8||secret.length>256)throw new Error('Enter a valid Threads App ID and App Secret');
      const vaultId=await socialVaultWrite(`victorysync_threads_app_${org}`,secret,'Threads app secret');
      await mcpPool.query(`insert into public.social_threads_apps(organization_id,app_id,app_secret_vault_id,configured_by) values($1,$2,$3,$4)
        on conflict(organization_id) do update set app_id=excluded.app_id,app_secret_vault_id=excluded.app_secret_vault_id,
        configured_by=excluded.configured_by,updated_at=now()`,[org,appId,vaultId,actor.id]);
      return send(res,200,{configured:true});
    }
    if(input.action==='start'){
      const app=await configuredApp(),state=randomBytes(32).toString('base64url');
      await mcpPool.query(`insert into public.social_oauth_states(state_hash,organization_id,user_id,redirect_uri,expires_at)
        values($1,$2,$3,$4,now()+interval '10 minutes')`,[createHash('sha256').update(state).digest('hex'),org,actor.id,callbackUrl]);
      const target=new URL('https://threads.net/oauth/authorize');
      target.search=new URLSearchParams({client_id:app.app_id,redirect_uri:callbackUrl,scope:'threads_basic,threads_content_publish,threads_manage_insights',response_type:'code',state}).toString();
      return send(res,200,{authorization_url:target.toString()});
    }
    throw new Error('Invalid action');
  }catch(error){return send(res,400,{error:error instanceof Error?error.message:'Threads connection failed'});}
}
