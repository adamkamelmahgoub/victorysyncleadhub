import type { IncomingMessage,ServerResponse } from 'node:http';
import { allowedEmail } from '../lib/mcp-auth.js';
import { socialRest } from '../lib/social-service.js';
import { socialOrganizationIds } from '../lib/social-auth.js';
export const config={api:{bodyParser:false},maxDuration:30};
function reply(res:ServerResponse,status:number,data:unknown){res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));}
async function admin(req:IncomingMessage){const auth=req.headers.authorization,key=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY;
  if(typeof auth!=='string'||!auth.startsWith('Bearer ')||!key||!process.env.SUPABASE_URL)throw new Error('Sign in first');
  const result=await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:key,authorization:auth},signal:AbortSignal.timeout(10000)});
  if(!result.ok)throw new Error('Session expired');const user=await result.json() as {id:string;email:string;email_confirmed_at?:string};
  if(!user.email_confirmed_at||!allowedEmail(user.email))throw new Error('CRM administrator access required');return user;}
export default async function handler(req:IncomingMessage,res:ServerResponse){try{const user=await admin(req);const orgs=await socialOrganizationIds(user.id);
  if(req.method==='GET'){if(!orgs.length)return reply(res,200,{accounts:[]});
    const accounts=await socialRest<any[]>(`connected_accounts?organization_id=in.(${orgs.join(',')})&select=id,organization_id,platform,label,external_account_id,username,scopes,status,token_expires_at,daily_new_dm_cap,daily_followup_cap,warmup_enabled,warmup_start_at,warmup_daily_increment,last_webhook_at,last_error,created_at&order=platform.asc,label.asc`);return reply(res,200,{accounts});}
  if(req.method!=='PATCH')return reply(res,405,{error:'Method not allowed'});
  let raw='';for await(const part of req){raw+=part;if(raw.length>10000)throw new Error('Request too large');}
  const data=JSON.parse(raw||'{}');const id=String(data.id||'');
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid account ID');
  const target=await socialRest<Array<{organization_id:string}>>(`connected_accounts?id=eq.${id}&select=organization_id&limit=1`);
  if(!target.length||!orgs.includes(target[0].organization_id))throw new Error('Organization access denied');
  const update:Record<string,unknown>={updated_at:new Date().toISOString()};
  if(data.action==='disconnect')update.status='disconnected';
  else if(data.action==='caps'){
    for(const key of ['daily_new_dm_cap','daily_followup_cap','warmup_daily_increment'])if(key in data){const value=Number(data[key]);if(!Number.isInteger(value)||value<0||value>1000)throw new Error('Invalid daily cap');update[key]=value;}
    if('warmup_enabled'in data)update.warmup_enabled=Boolean(data.warmup_enabled);
  }else throw new Error('Invalid account action');
  await socialRest(`connected_accounts?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(update)});return reply(res,200,{updated:true});
}catch(error){return reply(res,400,{error:error instanceof Error?error.message:'Account request failed'});}}
