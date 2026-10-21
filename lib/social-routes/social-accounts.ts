import type { IncomingMessage,ServerResponse } from 'node:http';
import { socialRest } from '../social-service.js';
import { socialActor,socialActorOrganizations,assertSocialPermission,isSocialOwner,SOCIAL_WORKSPACE_ORG_ID } from '../social-workspace-auth.js';
import {socialVaultWrite} from '../social-vault.js';
import {mcpPool} from '../mcp-auth.js';
export const config={api:{bodyParser:false},maxDuration:30};
function reply(res:ServerResponse,status:number,data:unknown){res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));}
export default async function handler(req:IncomingMessage,res:ServerResponse){try{const user=await socialActor(req);
  const orgs=[...new Set([...socialActorOrganizations(user,'accounts_manage'),...socialActorOrganizations(user,'inbox_view')])];
  if(req.method==='GET'){if(!orgs.length)return reply(res,200,{accounts:[]});
    const accounts=await socialRest<any[]>(`connected_accounts?organization_id=in.(${orgs.join(',')})&select=id,organization_id,platform,display_platform,profile_url,connection_mode,label,external_account_id,username,scopes,status,token_expires_at,daily_new_dm_cap,daily_followup_cap,warmup_enabled,warmup_start_at,warmup_daily_increment,last_webhook_at,last_error,created_at,owner_user_id,health,last_sync_at&order=platform.asc,label.asc`);
    return reply(res,200,{accounts});}
  if(!['PATCH','POST'].includes(req.method||''))return reply(res,405,{error:'Method not allowed'});
  let raw='';for await(const part of req){raw+=part;if(raw.length>10000)throw new Error('Request too large');}
  const data=JSON.parse(raw||'{}');
  if(req.method==='POST'){
    assertSocialPermission(user,SOCIAL_WORKSPACE_ORG_ID,'accounts_manage');
    if(data.action==='threads_token'){
      const token=String(data.access_token||'').trim();
      if(token.length<30||token.length>4000)throw new Error('Enter a valid Threads user access token');
      const response=await fetch('https://graph.threads.net/me?fields=id,username',{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error(`Threads rejected this token (${response.status})`);
      const profile=await response.json() as{id?:string;username?:string};
      if(!profile.id||!profile.username)throw new Error('Threads profile could not be verified');
      const inserted=await mcpPool.query<{id:string}>(`insert into public.connected_accounts
        (organization_id,platform,display_platform,external_account_id,profile_url,connection_mode,label,username,status,created_by,scopes)
        values($1,'threads','threads',$2,$3,'api',$4,$5,'active',$6,$7)
        on conflict(organization_id,platform,external_account_id) do update set status='active',connection_mode='api',label=excluded.label,username=excluded.username,updated_at=now() returning id`,
        [SOCIAL_WORKSPACE_ORG_ID,profile.id,`https://www.threads.net/@${profile.username}`,`@${profile.username}`,profile.username,user.id,[]]);
      const vaultId=await socialVaultWrite(`victorysync_social_account_${inserted.rows[0].id}`,token,'Threads user access token');
      await mcpPool.query(`insert into public.connected_account_secrets(connected_account_id,vault_access_token_id) values($1,$2)
        on conflict(connected_account_id) do update set vault_access_token_id=excluded.vault_access_token_id,updated_at=now()`,[inserted.rows[0].id,vaultId]);
      return reply(res,201,{id:inserted.rows[0].id,username:profile.username,connection_mode:'api'});
    }
    const display=String(data.platform||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'_');
    const label=String(data.label||'').trim(),profile=String(data.profile_url||'').trim();
    if(!/^[a-z][a-z0-9_]{1,39}$/.test(display)||!label||label.length>100)throw new Error('Enter a valid platform and account label');
    let url:URL;try{url=new URL(profile);}catch{throw new Error('Enter a public HTTPS profile URL');}
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password||profile.length>1000)throw new Error('Enter a public HTTPS profile URL');
    const native=['instagram','facebook','whatsapp','x','linkedin','tiktok','nextdoor','yelp','threads'].includes(display)?display:'other';
    const existing=await socialRest<Array<{id:string;owner_user_id:string|null}>>(`connected_accounts?organization_id=eq.${SOCIAL_WORKSPACE_ORG_ID}&platform=eq.${native}&external_account_id=eq.${encodeURIComponent(url.toString())}&select=id,owner_user_id&limit=1`);
    if(existing.length){if(existing[0].owner_user_id===user.id)return reply(res,200,{id:existing[0].id,connection_mode:'manual'});
      throw new Error('This profile is already connected by another teammate');}
    const accounts=await socialRest<Array<{id:string}>>('connected_accounts',{
      method:'POST',headers:{prefer:'return=representation'},body:JSON.stringify({organization_id:SOCIAL_WORKSPACE_ORG_ID,platform:native,display_platform:display,
        external_account_id:url.toString(),profile_url:url.toString(),connection_mode:'manual',provider:'manual',label,status:'active',created_by:user.id,owner_user_id:user.id})});
    return reply(res,201,{id:accounts[0]?.id,connection_mode:'manual'});
  }
  const id=String(data.id||'');
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid account ID');
  const target=await socialRest<Array<{organization_id:string;owner_user_id:string|null}>>(`connected_accounts?id=eq.${id}&select=organization_id,owner_user_id&limit=1`);
  if(!target.length)throw new Error('Account not found');
  assertSocialPermission(user,target[0].organization_id,'accounts_manage');
  if(target[0].owner_user_id&&target[0].owner_user_id!==user.id&&!isSocialOwner(user,target[0].organization_id))throw new Error('Account owner access required');
  const update:Record<string,unknown>={updated_at:new Date().toISOString()};
  if(data.action==='disconnect')update.status='disconnected';
  else if(data.action==='caps'){
    for(const key of ['daily_new_dm_cap','daily_followup_cap','warmup_daily_increment'])if(key in data){const value=Number(data[key]);if(!Number.isInteger(value)||value<0||value>1000)throw new Error('Invalid daily cap');update[key]=value;}
    if('warmup_enabled'in data)update.warmup_enabled=Boolean(data.warmup_enabled);
  }else throw new Error('Invalid account action');
  await socialRest(`connected_accounts?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(update)});return reply(res,200,{updated:true});
}catch(error){return reply(res,400,{error:error instanceof Error?error.message:'Account request failed'});}}
