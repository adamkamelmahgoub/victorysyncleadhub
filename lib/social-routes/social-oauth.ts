import type {IncomingMessage,ServerResponse} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {mcpPool} from '../mcp-auth.js';
import {socialActor,isSocialOwner} from '../social-workspace-auth.js';
import {socialVaultRead,socialVaultWrite} from '../social-vault.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const scopes=['pages_show_list','pages_manage_metadata','pages_read_engagement','pages_messaging',
  'pages_manage_posts','instagram_basic','instagram_manage_messages','instagram_content_publish'];
type App={organization_id:string;app_id:string;app_secret_vault_id:string;verify_token_vault_id:string;graph_version:string};
const json=(res:ServerResponse,status:number,data:unknown)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(data));};
async function origin(){
  const row=await mcpPool.query<{decrypted_secret:string}>(
    `select decrypted_secret from vault.decrypted_secrets where name='victorysync_leadgen_origin' limit 1`);
  const value=row.rows[0]?.decrypted_secret;
  if(!value||!/^https:\/\/[a-z0-9.-]+$/i.test(value))throw new Error('Configure the application origin before connecting accounts');
  return value;
}
async function appFor(orgId:string):Promise<App>{
  const result=await mcpPool.query<App>('select * from public.social_oauth_apps where organization_id=$1',[orgId]);
  if(!result.rows[0])throw new Error('Set up the Meta app in Connected Accounts first');
  return result.rows[0];
}
async function graph<T>(url:string,token:string,init:RequestInit={}):Promise<T>{
  const response=await fetch(url,{...init,headers:{authorization:`Bearer ${token}`,...init.headers},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Meta API request failed (${response.status})`);
  return response.json() as Promise<T>;
}
async function storeAccount(orgId:string,userId:string,platform:'facebook'|'instagram'|'whatsapp',externalId:string,label:string,token:string){
  const account=await mcpPool.query<{id:string}>(`insert into public.connected_accounts
    (organization_id,platform,external_account_id,label,status,created_by,scopes)
    values($1,$2,$3,$4,'active',$5,$6) on conflict(organization_id,platform,external_account_id)
    do update set label=excluded.label,status='active',last_error=null,updated_at=now() returning id`,
    [orgId,platform,externalId,label,userId,scopes]);
  const id=account.rows[0].id;
  const vaultId=await socialVaultWrite(`victorysync_social_account_${id}`,token,`${platform} account access token`);
  await mcpPool.query(`insert into public.connected_account_secrets(connected_account_id,vault_access_token_id)
    values($1,$2) on conflict(connected_account_id) do update set vault_access_token_id=excluded.vault_access_token_id,
    encrypted_access_token=null,updated_at=now()`,[id,vaultId]);
  await mcpPool.query(`insert into public.social_workspace_audit(organization_id,actor_id,action,target_type,target_id)
    values($1,$2,'account_connected','connected_account',$3)`,[orgId,userId,id]);
  return id;
}
async function callback(req:IncomingMessage,res:ServerResponse,url:URL){
  const state=url.searchParams.get('state')||'';
  const code=url.searchParams.get('code')||'';
  const base=await origin();
  if(!/^[a-zA-Z0-9_-]{30,100}$/.test(state)||!code||code.length>3000){
    res.statusCode=302;res.setHeader('location',`${base}/settings?social_connect=cancelled`);res.end();return;
  }
  const hash=createHash('sha256').update(state).digest('hex');
  const claimed=await mcpPool.query<{organization_id:string;user_id:string;redirect_uri:string}>(
    `update public.social_oauth_states set used_at=now() where state_hash=$1 and used_at is null
      and expires_at>now() returning organization_id,user_id,redirect_uri`,[hash]);
  if(!claimed.rows[0])throw new Error('Connection request expired; start again');
  const flow=claimed.rows[0],app=await appFor(flow.organization_id);
  const secret=await socialVaultRead(app.app_secret_vault_id);
  const tokenResponse=await fetch(`https://graph.facebook.com/${app.graph_version}/oauth/access_token`,{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:app.app_id,client_secret:secret,redirect_uri:flow.redirect_uri,code}),
    signal:AbortSignal.timeout(15000),
  });
  if(!tokenResponse.ok)throw new Error(`Meta authorization failed (${tokenResponse.status})`);
  const granted=await tokenResponse.json() as{access_token?:string};
  if(!granted.access_token)throw new Error('Meta did not return an access token');
  const pages=await graph<{data?:Array<{id:string;name:string;access_token:string;instagram_business_account?:{id:string}}>}>(
    `https://graph.facebook.com/${app.graph_version}/me/accounts?fields=name,access_token,tasks,instagram_business_account&limit=100`,granted.access_token);
  let count=0;
  for(const page of pages.data||[]){
    if(!page.id||!page.access_token)continue;
    await storeAccount(flow.organization_id,flow.user_id,'facebook',String(page.id),String(page.name||'Facebook Page'),page.access_token);count++;
    if(page.instagram_business_account?.id){
      await storeAccount(flow.organization_id,flow.user_id,'instagram',String(page.instagram_business_account.id),
        `${page.name||'Page'} Instagram`,page.access_token);count++;
    }
  }
  res.statusCode=302;res.setHeader('location',`${base}/settings?social_connect=${count?'connected':'no_pages'}`);res.end();
}
export default async function handler(req:IncomingMessage,res:ServerResponse){
  try{
    const url=new URL(req.url||'/', 'https://local.invalid');
    if(req.method==='GET'&&url.searchParams.get('action')==='callback')return await callback(req,res,url);
    const actor=await socialActor(req);
    if(req.method==='GET'){
      const orgId=url.searchParams.get('organization_id')||'';
      if(!orgId){
        const ids=[...new Set([...actor.ownerOrganizations,...actor.memberships.filter((m)=>m.role==='owner').map((m)=>m.org_id)])];
        const organizations=ids.length?await mcpPool.query<{id:string;name:string}>(
          'select id,name from public.organizations where id=any($1::uuid[]) order by name',[ids]):{rows:[]};
        return json(res,200,{organizations:organizations.rows});
      }
      if(!uuid.test(orgId)||!isSocialOwner(actor,orgId))throw new Error('Owner access required');
      const result=await mcpPool.query<App>('select * from public.social_oauth_apps where organization_id=$1',[orgId]);
      const base=await origin();
      return json(res,200,{configured:!!result.rows[0],app_id:result.rows[0]?.app_id||'',
        graph_version:result.rows[0]?.graph_version||'v25.0',
        callback_url:`${base}/api/social-oauth?action=callback`,webhook_url:`${base}/api/social-webhook`});
    }
    if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
    let raw='';for await(const part of req){raw+=part;if(raw.length>12000)throw new Error('Request too large');}
    const input=JSON.parse(raw||'{}') as Record<string,unknown>;
    const orgId=String(input.organization_id||'');
    if(!uuid.test(orgId)||!isSocialOwner(actor,orgId))throw new Error('Owner access required');
    if(input.action==='configure'){
      const appId=String(input.app_id||'').trim(),appSecret=String(input.app_secret||''),version=String(input.graph_version||'');
      if(!/^\d{5,30}$/.test(appId)||appSecret.length<8||appSecret.length>256||!/^v\d+\.\d+$/.test(version))
        throw new Error('Enter a valid Meta app ID, app secret, and Graph API version');
      const verifyToken=randomBytes(32).toString('base64url');
      const secretId=await socialVaultWrite(`victorysync_social_app_${orgId}`,appSecret,'Meta app secret');
      const verifyId=await socialVaultWrite(`victorysync_social_verify_${orgId}`,verifyToken,'Meta webhook verify token');
      await mcpPool.query(`insert into public.social_oauth_apps
        (organization_id,app_id,app_secret_vault_id,verify_token_vault_id,graph_version,configured_by)
        values($1,$2,$3,$4,$5,$6) on conflict(organization_id) do update set app_id=excluded.app_id,
        app_secret_vault_id=excluded.app_secret_vault_id,verify_token_vault_id=excluded.verify_token_vault_id,
        graph_version=excluded.graph_version,configured_by=excluded.configured_by,updated_at=now()`,
        [orgId,appId,secretId,verifyId,version,actor.id]);
      await mcpPool.query(`insert into public.social_workspace_audit(organization_id,actor_id,action,target_type,target_id)
        values($1,$2,'meta_app_configured','social_oauth_app',$1::text)`,[orgId,actor.id]);
      return json(res,200,{configured:true,verify_token:verifyToken});
    }
    const app=await appFor(orgId);
    if(input.action==='start'){
      const state=randomBytes(32).toString('base64url'),base=await origin();
      const redirectUri=`${base}/api/social-oauth?action=callback`;
      await mcpPool.query(`insert into public.social_oauth_states(state_hash,organization_id,user_id,redirect_uri,expires_at)
        values($1,$2,$3,$4,now()+interval '10 minutes')`,
        [createHash('sha256').update(state).digest('hex'),orgId,actor.id,redirectUri]);
      const target=new URL(`https://www.facebook.com/${app.graph_version}/dialog/oauth`);
      target.search=new URLSearchParams({client_id:app.app_id,redirect_uri:redirectUri,state,
        response_type:'code',scope:scopes.join(',')}).toString();
      return json(res,200,{authorization_url:target.toString()});
    }
    if(input.action==='whatsapp'){
      const wabaId=String(input.waba_id||''),phoneId=String(input.phone_number_id||''),token=String(input.access_token||'');
      if(!/^\d{5,30}$/.test(wabaId)||!/^\d{5,30}$/.test(phoneId)||token.length<20||token.length>4000)
        throw new Error('Enter your WABA ID, Phone Number ID, and Cloud API token');
      const numbers=await graph<{data?:Array<{id:string;display_phone_number?:string;verified_name?:string}>}>(
        `https://graph.facebook.com/${app.graph_version}/${wabaId}/phone_numbers`,token);
      const number=numbers.data?.find((item)=>String(item.id)===phoneId);
      if(!number)throw new Error('The phone number was not found in this WhatsApp Business Account');
      const id=await storeAccount(orgId,actor.id,'whatsapp',phoneId,
        number.verified_name||number.display_phone_number||`WhatsApp ${phoneId}`,token);
      const subscribed=await fetch(`https://graph.facebook.com/${app.graph_version}/${wabaId}/subscribed_apps`,{
        method:'POST',headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
      if(!subscribed.ok){
        await mcpPool.query(`update public.connected_accounts set status='error',last_error=$2 where id=$1`,
          [id,`Webhook subscription failed (${subscribed.status})`]);
        throw new Error('Account saved, but WABA webhook subscription failed. Reconnect after checking permissions');
      }
      return json(res,200,{connected:true,account_id:id});
    }
    throw new Error('Invalid connection action');
  }catch(error){return json(res,400,{error:error instanceof Error?error.message:'Connection failed'});}
}
