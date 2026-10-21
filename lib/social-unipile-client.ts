import {mcpPool} from './mcp-auth.js';
import {socialVaultRead} from './social-vault.js';
import {normalizeSocial} from './social-handles.js';

export type UnipileConfig={api_key_vault_id:string;api_base_url:string|null;api_version:'v1'|'v2'};
export function normalizeUnipileDsn(value:string):string{
  const raw=value.trim();
  const url=new URL(raw.startsWith('https://')?raw:`https://${raw}`);
  if(url.protocol!=='https:'||!/^api\d+\.unipile\.com$/i.test(url.hostname)||!/^\d{2,5}$/.test(url.port)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Enter the exact Unipile DSN, such as apiXX.unipile.com:PORT');
  return url.origin;
}
export function unipileUrl(config:Pick<UnipileConfig,'api_version'|'api_base_url'>,path:string,accountId?:string):string{
  if(!path.startsWith('/'))throw new Error('Invalid Unipile path');
  if(config.api_version==='v1'){
    if(!config.api_base_url)throw new Error('Unipile DSN is missing');
    return `${normalizeUnipileDsn(config.api_base_url)}/api/v1${path}`;
  }
  return `https://api.unipile.com/v2${accountId?`/${encodeURIComponent(accountId)}`:''}${path}`;
}
export function unipilePortFallback(url:string):string{
  const parsed=new URL(url);
  if(!/^api\d+\.unipile\.com$/i.test(parsed.hostname)||!parsed.port)throw new Error('Invalid Unipile DSN fallback');
  const port=parsed.port;parsed.port='';parsed.searchParams.set('port',port);
  return parsed.toString();
}
export function unipileSenderFlag(value:unknown):boolean|null{
  if(value===true||value===1||value==='1')return true;
  if(value===false||value===0||value==='0')return false;
  return null;
}
export function normalizeV1UnipileMessage(event:Record<string,unknown>){
  if(event.event!=='message_received')return null;
  const sender=event.sender as Record<string,unknown>|undefined;
  const accountInfo=event.account_info as Record<string,unknown>|undefined;
  const attendees=Array.isArray(event.attendees)?event.attendees as Record<string,unknown>[]:[];
  const ownerId=String(accountInfo?.user_id||'');
  const outbound=unipileSenderFlag(event.is_sender)??(Boolean(ownerId)&&sender?.attendee_provider_id===ownerId);
  const participant=attendees.find(value=>String(value.attendee_provider_id||'')!==ownerId && (!outbound||String(value.attendee_provider_id||'')!==String(sender?.attendee_provider_id||'')))
    ||attendees.find(value=>String(value.attendee_provider_id||'')!==String(sender?.attendee_provider_id||''));
  let handle=String(participant?.attendee_public_identifier||'');
  const profileUrl=String(participant?.attendee_profile_url||'');
  if(!handle&&profileUrl){try{const platform=String(event.account_type||'').toLowerCase()==='linkedin'?'linkedin_person':'instagram';
    handle=normalizeSocial(platform,profileUrl).handle;}catch{}}
  return {account_id:event.account_id,type:'message.new',payload:{id:event.message_id,chat_id:event.chat_id,
    sender_id:sender?.attendee_provider_id||sender?.attendee_id,
    participant_id:participant?.attendee_provider_id||participant?.attendee_id,
    participant_handle:handle||null,
    participant_name:participant?.attendee_name||null,
    participant_profile_url:participant?.attendee_profile_url||null,
    is_sender:outbound,
    text:event.message,timestamp:event.timestamp,attachments:event.attachments||[]}};
}
export async function getUnipileConfig(organizationId:string):Promise<UnipileConfig>{
  const result=await mcpPool.query<UnipileConfig>(`select api_key_vault_id,api_base_url,api_version from public.social_unipile_config where organization_id=$1`,[organizationId]);
  if(!result.rows[0])throw new Error('Save the Unipile DSN and access token first');
  return result.rows[0];
}
export async function unipileRequest(organizationId:string,path:string,init?:RequestInit,accountId?:string):Promise<Record<string,unknown>>{
  const config=await getUnipileConfig(organizationId);
  const key=await socialVaultRead(config.api_key_vault_id);
  return requestUnipile(config,key,path,init,accountId);
}
export async function requestUnipile(config:UnipileConfig,key:string,path:string,init?:RequestInit,accountId?:string):Promise<Record<string,unknown>>{
  const url=unipileUrl(config,path,accountId);
  const options={...init,headers:{'X-API-KEY':key,accept:'application/json',...init?.headers},signal:AbortSignal.timeout(10000)};
  let response:Response;
  try{response=await fetch(url,options);}catch(error){
    if(config.api_version!=='v1')throw error;
    response=await fetch(unipilePortFallback(url),{...options,signal:AbortSignal.timeout(10000)});
  }
  if(!response.ok){
    const detail=await response.json().catch(()=>null) as {title?:string;type?:string}|null;
    if(response.status===401)throw new Error('Unipile rejected this access token for the configured DSN. Check the DSN and generate a new token in Unipile.');
    throw new Error(`Unipile request failed (${response.status})${detail?.title?`: ${detail.title}`:''}`);
  }
  return response.json() as Promise<Record<string,unknown>>;
}
