import {decryptToken} from './social-crypto.js';
import {socialRest} from './social-service.js';
import {assertSocialOrganization} from './social-auth.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Thread={id:string;organization_id:string;channel:string;connected_account_id:string;participant_platform_id:string;
  company_id:string|null;contact_id:string|null;lead_id:string|null};
type Account={id:string;platform:string;external_account_id:string};
export async function sendSocialReply(userId:string,conversationId:string,body:string){
  const text=body.trim();if(!uuid.test(conversationId)||!text||text.length>2000)throw new Error('Invalid conversation or reply text');
  let attemptId:string|null=null,providerSent=false;
  try{
    const [thread]=await socialRest<Thread[]>(`conversations?id=eq.${conversationId}&select=id,organization_id,channel,connected_account_id,participant_platform_id,company_id,contact_id,lead_id&limit=1`);
    if(!thread)throw new Error('Conversation not found');
    await assertSocialOrganization(userId,thread.organization_id);
    const [account]=await socialRest<Account[]>(`connected_accounts?id=eq.${thread.connected_account_id}&select=id,platform,external_account_id&limit=1`);
    if(!account||!['facebook','whatsapp'].includes(thread.channel)||account.platform!==thread.channel)throw new Error('API reply unavailable for this channel');
    const [secret]=await socialRest<Array<{encrypted_access_token:string}>>(`connected_account_secrets?connected_account_id=eq.${account.id}&select=encrypted_access_token&limit=1`);
    if(!secret?.encrypted_access_token)throw new Error('Connected account token missing');
    attemptId=await socialRest<string>('rpc/social_reserve_reply',{method:'POST',body:JSON.stringify({p_conversation_id:conversationId,p_sent_by:userId})});
    const version=process.env.META_GRAPH_VERSION;
    if(!version||!/^v\d+\.\d+$/.test(version))throw new Error('META_GRAPH_VERSION is not configured');
    const endpoint=`https://graph.facebook.com/${version}/${encodeURIComponent(account.external_account_id)}/messages`;
    const payload=thread.channel==='whatsapp'
      ? {messaging_product:'whatsapp',to:thread.participant_platform_id,type:'text',text:{body:text}}
      : {recipient:{id:thread.participant_platform_id},messaging_type:'RESPONSE',message:{text}};
    const response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${decryptToken(secret.encrypted_access_token)}`,'content-type':'application/json'},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    const result=await response.json() as{message_id?:string;messages?:Array<{id:string}>;error?:{message?:string}};
    if(!response.ok)throw new Error(`Provider rejected reply: ${result.error?.message||response.status}`);
    const externalId=thread.channel==='whatsapp'?result.messages?.[0]?.id:result.message_id;
    if(!externalId)throw new Error('Provider did not return a message ID');providerSent=true;
    await socialRest(`social_send_attempts?id=eq.${attemptId}`,{method:'PATCH',body:JSON.stringify({status:'sent',external_message_id:externalId,completed_at:new Date().toISOString()})});
    const created=await socialRest<Array<{id:string}>>('messages?on_conflict=conversation_id,external_message_id',{
      method:'POST',headers:{prefer:'resolution=ignore-duplicates,return=representation'},
      body:JSON.stringify({organization_id:thread.organization_id,conversation_id:thread.id,direction:'outbound',body:text,
        external_message_id:externalId,sent_via:'api',sent_by:userId,status:'sent'}),
    });
    await socialRest(`conversations?id=eq.${thread.id}`,{method:'PATCH',body:JSON.stringify({last_outbound_at:new Date().toISOString(),last_message_at:new Date().toISOString()})});
    if(created.length&&thread.company_id)await socialRest('crm_activities',{method:'POST',body:JSON.stringify({
      organization_id:thread.organization_id,company_id:thread.company_id,contact_id:thread.contact_id,
      type:'dm_sent',body:text,occurred_at:new Date().toISOString(),created_by:userId,
      metadata:{conversation_id:thread.id,channel:thread.channel,external_message_id:externalId},
    })});
    return {message_id:externalId};
  }catch(error){
    if(attemptId&&!providerSent)await socialRest(`social_send_attempts?id=eq.${attemptId}`,{method:'PATCH',body:JSON.stringify({status:'failed',error:String(error).slice(0,500),completed_at:new Date().toISOString()})}).catch(()=>{});
    if(providerSent)throw new Error('Provider sent the reply, but CRM logging failed. Refresh the thread before retrying.');
    throw error;
  }
}
