import {socialRest} from './social-service.js';
import {assertSocialOrganization} from './social-auth.js';
import {socialAccountToken,socialGraphVersion} from './social-vault.js';
import {assertSocialPermission,type SocialActor} from './social-workspace-auth.js';
import {providerAdapters,type Channel} from './social-providers.js';
import {mcpPool} from './mcp-auth.js';
import {socialVaultRead} from './social-vault.js';
import {isSocialOwner} from './social-workspace-auth.js';
import {getUnipileConfig,unipileRequest} from './social-unipile-client.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Thread={id:string;organization_id:string;channel:string;connected_account_id:string;participant_platform_id:string;
  company_id:string|null;contact_id:string|null;lead_id:string|null;external_thread_id:string|null;last_inbound_at:string|null};
type Account={id:string;platform:string;external_account_id:string;provider:string|null;owner_user_id:string|null;status:string};
export async function sendSocialReply(userId:string,conversationId:string,body:string,actor?:SocialActor){
  const text=body.trim();if(!uuid.test(conversationId)||!text||text.length>2000)throw new Error('Invalid conversation or reply text');
  let attemptId:string|null=null,providerSent=false;
  try{
    const [thread]=await socialRest<Thread[]>(`conversations?id=eq.${conversationId}&select=id,organization_id,channel,connected_account_id,participant_platform_id,company_id,contact_id,lead_id,external_thread_id,last_inbound_at&limit=1`);
    if(!thread)throw new Error('Conversation not found');
    if(actor)assertSocialPermission(actor,thread.organization_id,'inbox_reply');
    else await assertSocialOrganization(userId,thread.organization_id);
    const [account]=await socialRest<Account[]>(`connected_accounts?id=eq.${thread.connected_account_id}&select=id,platform,external_account_id,provider,owner_user_id,status&limit=1`);
    const adapter=providerAdapters[thread.channel as Channel];
    if(!account||account.status!=='active'||account.platform!==thread.channel)throw new Error('API reply unavailable for this channel');
    if(account.owner_user_id&&account.owner_user_id!==userId&&(!actor||!isSocialOwner(actor,thread.organization_id)))throw new Error('Account owner access required');
    if(account.provider!=='unipile'&&!adapter?.capabilities.canReply)throw new Error('API reply unavailable for this channel');
    const inbound=await socialRest<Array<{id:string}>>(`messages?conversation_id=eq.${conversationId}&direction=eq.inbound&select=id&limit=1`);
    if(!inbound.length)throw new Error('API reply requires an inbound message from this person');
    if(!thread.last_inbound_at||Date.now()-new Date(thread.last_inbound_at).getTime()>24*3600000)throw new Error('Reply window has expired');
    attemptId=await socialRest<string>('rpc/social_reserve_reply',{method:'POST',body:JSON.stringify({p_conversation_id:conversationId,p_sent_by:userId})});
    let externalId:string;
    if(account.provider==='unipile'){
      if(!thread.external_thread_id)throw new Error('Unipile chat is missing');
      const config=await getUnipileConfig(thread.organization_id);
      const result=await unipileRequest(thread.organization_id,config.api_version==='v1'
        ?`/chats/${encodeURIComponent(thread.external_thread_id)}/messages`
        :`/chats/${encodeURIComponent(thread.external_thread_id)}/messages/send`,
        config.api_version==='v1'?{method:'POST',body:(()=>{const data=new FormData();data.set('text',text);data.set('account_id',account.external_account_id);return data;})()}
          :{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})},account.external_account_id);
      externalId=String(result.message_id||(result.data as Record<string,unknown>|undefined)?.message_id||'');
      if(!externalId)throw new Error('Unipile sent a reply without a message ID');
    }else externalId=await adapter.sendReply({accountExternalId:account.external_account_id,recipientId:thread.participant_platform_id,
      body:text,accessToken:await socialAccountToken(account.id),graphVersion:await socialGraphVersion(thread.organization_id)});
    providerSent=true;
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
