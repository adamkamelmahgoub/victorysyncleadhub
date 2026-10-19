import type { IncomingMessage, ServerResponse } from 'node:http';
import { allowedEmail } from '../lib/mcp-auth.js';
import { decryptToken } from '../lib/social-crypto.js';
import { socialRest } from '../lib/social-service.js';
import { assertSocialOrganization } from '../lib/social-auth.js';

export const config={api:{bodyParser:false},maxDuration:30};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reply(res:ServerResponse,status:number,data:unknown){res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));}
async function read(req:IncomingMessage){let raw='';for await(const part of req){raw+=part;if(raw.length>10000)throw new Error('Request too large');}return JSON.parse(raw||'{}');}
async function admin(req:IncomingMessage){
  const auth=req.headers.authorization,key=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY;
  if(typeof auth!=='string'||!auth.startsWith('Bearer ')||!key||!process.env.SUPABASE_URL)throw new Error('Sign in first');
  const result=await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:key,authorization:auth},signal:AbortSignal.timeout(10000)});
  if(!result.ok)throw new Error('Session expired');
  const user=await result.json() as {id:string;email:string;email_confirmed_at?:string};
  if(!user.email_confirmed_at||!allowedEmail(user.email))throw new Error('CRM administrator access required');
  return user;
}
type Conversation={id:string;organization_id:string;channel:string;connected_account_id:string;participant_platform_id:string;
  company_id:string|null;contact_id:string|null;lead_id:string|null};
type Account={id:string;platform:string;external_account_id:string;status:string};
export default async function handler(req:IncomingMessage,res:ServerResponse){
  if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
  let attemptId:string|null=null;
  let providerSent=false;
  try{
    const user=await admin(req);
    const data=await read(req);
    const conversationId=String(data.conversation_id||'');const body=String(data.body||'').trim();
    if(!uuid.test(conversationId)||!body||body.length>2000)throw new Error('Invalid conversation or reply text');
    const [thread]=await socialRest<Conversation[]>(`conversations?id=eq.${conversationId}&select=id,organization_id,channel,connected_account_id,participant_platform_id,company_id,contact_id,lead_id&limit=1`);
    if(!thread)throw new Error('Conversation not found');
    await assertSocialOrganization(user.id,thread.organization_id);
    const [account]=await socialRest<Account[]>(`connected_accounts?id=eq.${thread.connected_account_id}&select=id,platform,external_account_id,status&limit=1`);
    if(!account||!['facebook','whatsapp'].includes(thread.channel)||account.platform!==thread.channel)throw new Error('API reply is not available for this channel');
    const [secret]=await socialRest<Array<{encrypted_access_token:string}>>(`connected_account_secrets?connected_account_id=eq.${account.id}&select=encrypted_access_token&limit=1`);
    if(!secret?.encrypted_access_token)throw new Error('Connected account token is missing');
    const reserved=await socialRest<string>('rpc/social_reserve_reply',{method:'POST',body:JSON.stringify({p_conversation_id:conversationId,p_sent_by:user.id})});
    attemptId=reserved;
    const version=process.env.META_GRAPH_VERSION;
    if(!version||!/^v\d+\.\d+$/.test(version))throw new Error('META_GRAPH_VERSION is not configured');
    const endpoint=`https://graph.facebook.com/${version}/${encodeURIComponent(account.external_account_id)}/messages`;
    const payload=thread.channel==='whatsapp'
      ? {messaging_product:'whatsapp',to:thread.participant_platform_id,type:'text',text:{body}}
      : {recipient:{id:thread.participant_platform_id},messaging_type:'RESPONSE',message:{text:body}};
    const response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${decryptToken(secret.encrypted_access_token)}`,'content-type':'application/json'},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    const result=await response.json() as {message_id?:string;messages?:Array<{id:string}>;error?:{message?:string}};
    if(!response.ok)throw new Error(`Provider rejected reply: ${result.error?.message||response.status}`);
    const externalId=thread.channel==='whatsapp'?result.messages?.[0]?.id:result.message_id;
    if(!externalId)throw new Error('Provider did not return a message ID');
    providerSent=true;
    await socialRest(`social_send_attempts?id=eq.${attemptId}`,{method:'PATCH',body:JSON.stringify({status:'sent',external_message_id:externalId,completed_at:new Date().toISOString()})});
    const created=await socialRest<Array<{id:string}>>('messages?on_conflict=conversation_id,external_message_id',{
      method:'POST',headers:{prefer:'resolution=ignore-duplicates,return=representation'},
      body:JSON.stringify({organization_id:thread.organization_id,conversation_id:thread.id,direction:'outbound',body,
        external_message_id:externalId,sent_via:'api',sent_by:user.id,status:'sent'}),
    });
    await socialRest(`conversations?id=eq.${thread.id}`,{method:'PATCH',body:JSON.stringify({last_outbound_at:new Date().toISOString(),last_message_at:new Date().toISOString()})});
    if(created.length&&thread.company_id)await socialRest('crm_activities',{method:'POST',body:JSON.stringify({
      organization_id:thread.organization_id,company_id:thread.company_id,contact_id:thread.contact_id,
      type:'dm_sent',body,occurred_at:new Date().toISOString(),created_by:user.id,
      metadata:{conversation_id:thread.id,channel:thread.channel,external_message_id:externalId},
    })});
    return reply(res,200,{message_id:externalId});
  }catch(error){
    if(attemptId&&!providerSent)await socialRest(`social_send_attempts?id=eq.${attemptId}`,{method:'PATCH',body:JSON.stringify({status:'failed',error:String(error).slice(0,500),completed_at:new Date().toISOString()})}).catch(()=>{});
    return reply(res,providerSent?502:400,{error:providerSent?'Provider sent the reply, but CRM logging failed. Refresh this thread before retrying.':error instanceof Error?error.message:'Reply failed'});
  }
}
