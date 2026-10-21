import type { IncomingMessage, ServerResponse } from 'node:http';
import { processDueSocialPosts,refreshSocialPostMetrics } from './social-posts.js';
import { socialRest } from '../social-service.js';
import type { InboundEvent, MessageStatusEvent } from '../social-providers.js';
import { syncLegacyInbound } from '../social-legacy-sync.js';
import { classifyIntent } from '../social-intent.js';

export const config = { maxDuration: 60 };
type Job = { id: string; provider: string; payload: InboundEvent | MessageStatusEvent | Record<string,unknown>; attempts: number };
type Account = { id: string; organization_id: string };
type Profile = { entity_type: string; entity_id: string };

async function processUnipileEvent(raw:Record<string,unknown>){
  const accountId=String(raw.account_id||''),type=String(raw.type||'');
  const accounts=await socialRest<Array<{id:string;organization_id:string;platform:string;owner_user_id:string|null}>>(
    `connected_accounts?provider=eq.unipile&external_account_id=eq.${encodeURIComponent(accountId)}&select=id,organization_id,platform,owner_user_id&limit=2`);
  if(accounts.length!==1)throw new Error('No unique Unipile account for event');
  const account=accounts[0],payload=(raw.payload||{}) as Record<string,unknown>;
  if(type.startsWith('account.status.')){
    const state=type.slice('account.status.'.length);
    const status=state==='running'?'active':state==='disconnected'?'disconnected':'error';
    await socialRest(`connected_accounts?id=eq.${account.id}`,{method:'PATCH',body:JSON.stringify({status,health:status==='active'?'healthy':status==='disconnected'?'disconnected':'warning',
      last_error:status==='active'?null:String(payload.reason||state),last_webhook_at:new Date().toISOString()})});
    return;
  }
  if(type!=='message.new')return;
  const messageId=String(payload.id||''),chatId=String(payload.chat_id||''),senderId=String(payload.sender_id||'');
  if(!messageId||!chatId||!senderId)throw new Error('Incomplete Unipile message');
  const outbound=payload.is_sender===true;
  type Conversation={id:string;company_id:string|null;contact_id:string|null;lead_id:string|null};
  let threads=await socialRest<Conversation[]>(`conversations?connected_account_id=eq.${account.id}&external_thread_id=eq.${encodeURIComponent(chatId)}&select=id,company_id,contact_id,lead_id&limit=1`);
  if(!threads.length&&outbound)return; // The chat needs a verified participant before attributing a phone echo.
  if(!threads.length){
    const matches=await socialRest<Profile[]>(`social_profiles?organization_id=eq.${account.organization_id}&platform=eq.${account.platform==='linkedin'?'linkedin_person':account.platform}&platform_user_id=eq.${encodeURIComponent(senderId)}&select=entity_type,entity_id&limit=2`);
    const matched=matches.length===1?matches[0]:undefined;
    threads=await socialRest<Conversation[]>('conversations?on_conflict=organization_id,channel,connected_account_id,external_thread_id',{
      method:'POST',headers:{prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({organization_id:account.organization_id,channel:account.platform,
        connected_account_id:account.id,external_thread_id:chatId,participant_platform_id:senderId,assigned_to:account.owner_user_id,
        match_status:matched?'matched':'unmatched',contact_id:matched?.entity_type==='contact'?matched.entity_id:null,
        company_id:matched?.entity_type==='company'?matched.entity_id:null,lead_id:matched?.entity_type==='lead'?matched.entity_id:null})});
  }
  const thread=threads[0];if(!thread)throw new Error('Unipile conversation could not be created');
  const now=String(payload.timestamp||raw.created_at||new Date().toISOString()),body=String(payload.text||'').slice(0,50000);
  if(outbound&&body){
    const manual=await socialRest<Array<{id:string}>>(`messages?conversation_id=eq.${thread.id}&direction=eq.outbound&sent_via=eq.manual_assisted&external_message_id=is.null&body=eq.${encodeURIComponent(body)}&created_at=gte.${encodeURIComponent(new Date(Date.now()-10*60*1000).toISOString())}&select=id&order=created_at.desc&limit=2`);
    if(manual.length===1){await socialRest(`messages?id=eq.${manual[0].id}`,{method:'PATCH',body:JSON.stringify({external_message_id:messageId,status:'sent'})});return;}
  }
  const inserted=await socialRest<Array<{id:string}>>('messages?on_conflict=conversation_id,external_message_id',{
    method:'POST',headers:{prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({organization_id:account.organization_id,
      conversation_id:thread.id,direction:outbound?'outbound':'inbound',body,attachments:payload.attachments||[],
      external_message_id:messageId,sender_provider_id:senderId,sent_via:outbound?'echo':null,status:'sent',created_at:now})});
  if(!inserted.length)return;
  await socialRest(`conversations?id=eq.${thread.id}`,{method:'PATCH',body:JSON.stringify(outbound?
    {last_outbound_at:now,last_message_at:now}:{last_inbound_at:now,last_message_at:now,unread_count:1,
      reply_window_expires_at:new Date(new Date(now).getTime()+24*3600000).toISOString()})});
  if(!outbound){
    const entity=thread.lead_id?{type:'lead',id:thread.lead_id}:thread.contact_id?{type:'contact',id:thread.contact_id}:thread.company_id?{type:'company',id:thread.company_id}:null;
    if(entity)await socialRest(`dm_enrollments?organization_id=eq.${account.organization_id}&state=in.(queued,step_due,sent)&entity_type=eq.${entity.type}&entity_id=eq.${entity.id}`,
      {method:'PATCH',body:JSON.stringify({state:'replied',stopped_at:new Date().toISOString(),stop_reason:'inbound_reply'})});
    const intent=await classifyIntent(body).catch(()=> 'unknown' as const);
    await socialRest(`conversations?id=eq.${thread.id}`,{method:'PATCH',body:JSON.stringify({intent})});
  }
  if(thread.company_id)await socialRest('crm_activities',{method:'POST',body:JSON.stringify({organization_id:account.organization_id,
    company_id:thread.company_id,contact_id:thread.contact_id,type:outbound?'dm_sent':'dm_reply',body,occurred_at:now,
    metadata:{channel:account.platform,external_message_id:messageId,conversation_id:thread.id}})});
  await socialRest(`connected_accounts?id=eq.${account.id}`,{method:'PATCH',body:JSON.stringify({last_webhook_at:new Date().toISOString(),last_sync_at:new Date().toISOString()})});
}

async function processEvent(job: Job) {
  if(job.provider==='unipile')return processUnipileEvent(job.payload as Record<string,unknown>);
  const event = job.payload as InboundEvent | MessageStatusEvent;
  if('kind' in event){
    const accounts=await socialRest<Account[]>(`connected_accounts?platform=eq.${event.channel}&external_account_id=eq.${encodeURIComponent(event.accountId)}&select=id,organization_id&limit=2`);
    if(accounts.length!==1)throw new Error('No unique connected account for message status');
    const account=accounts[0];
    const messages=await socialRest<Array<{id:string;conversation_id:string;status:string}>>(
      `messages?organization_id=eq.${account.organization_id}&external_message_id=eq.${encodeURIComponent(event.externalMessageId)}&select=id,conversation_id,status&limit=10`);
    for(const message of messages){
      const threads=await socialRest<Array<{id:string}>>(`conversations?id=eq.${message.conversation_id}&connected_account_id=eq.${account.id}&select=id&limit=1`);
      if(!threads.length)continue;
      const rank:Record<string,number>={queued:0,sent:1,delivered:2,read:3,failed:4};
      if((rank[event.status]||0)<(rank[message.status]||0))continue;
      await socialRest(`messages?id=eq.${message.id}`,{method:'PATCH',body:JSON.stringify({status:event.status,error:event.error})});
    }
    await socialRest(`connected_accounts?id=eq.${account.id}`,{method:'PATCH',body:JSON.stringify({last_webhook_at:new Date().toISOString()})});
    return;
  }
  const accounts = await socialRest<Account[]>(`connected_accounts?platform=eq.${encodeURIComponent(event.channel)}&external_account_id=eq.${encodeURIComponent(event.accountId)}&status=eq.active&select=id,organization_id&limit=2`);
  if (accounts.length !== 1) throw new Error('No unique active connected account for webhook recipient');
  const account = accounts[0];
  const participantId = event.isEcho ? event.recipientId : event.senderId;
  if(event.isEcho){
    const confirmed=await socialRest<string|null>('rpc/social_match_manual_echo',{method:'POST',body:JSON.stringify({
      p_account_id:account.id,p_participant_id:participantId,p_body:event.body,p_external_id:event.externalMessageId,
    })});
    if(confirmed){
      await socialRest(`connected_accounts?id=eq.${account.id}`,{method:'PATCH',body:JSON.stringify({last_webhook_at:new Date().toISOString()})});
      return;
    }
  }
  const profiles = await socialRest<Profile[]>(`social_profiles?organization_id=eq.${account.organization_id}&platform=eq.${encodeURIComponent(event.channel)}&platform_user_id=eq.${encodeURIComponent(participantId)}&select=entity_type,entity_id&limit=2`);
  let matched = profiles.length === 1 ? profiles[0] : undefined;
  if (!matched && event.channel === 'whatsapp') {
    const phone = participantId.replace(/\D/g, '');
    const leads = await socialRest<Array<{ id: string }>>(`leads?organization_id=eq.${account.organization_id}&normalized_phone=eq.${phone}&select=id&limit=2`);
    if (leads.length === 1) matched = { entity_type: 'lead', entity_id: leads[0].id };
  }
  const thread = `${account.id}:${participantId}`;
  type Conversation = { id: string; company_id: string | null; legacy_company_id: string | null; contact_id: string | null; lead_id: string | null };
  let legacyCompanyId:string|null=null;
  if(matched?.entity_type==='company'){
    const crm=await socialRest<Array<{id:string}>>(`crm_companies?id=eq.${matched.entity_id}&select=id&limit=1`);
    if(!crm.length)legacyCompanyId=matched.entity_id;
  }
  let conversations = await socialRest<Conversation[]>(`conversations?organization_id=eq.${account.organization_id}&channel=eq.${event.channel}&connected_account_id=eq.${account.id}&external_thread_id=eq.${encodeURIComponent(thread)}&select=id,company_id,legacy_company_id,contact_id,lead_id&limit=1`);
  if (!conversations.length) conversations = await socialRest<Conversation[]>(
    'conversations?on_conflict=organization_id,channel,connected_account_id,external_thread_id', {
      method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ organization_id: account.organization_id, channel: event.channel,
        connected_account_id: account.id, external_thread_id: thread, participant_platform_id: participantId,
        contact_id: matched?.entity_type === 'contact' ? matched.entity_id : null,
        company_id: matched?.entity_type === 'company' && !legacyCompanyId ? matched.entity_id : null,
        legacy_company_id:legacyCompanyId,
        lead_id: matched?.entity_type === 'lead' ? matched.entity_id : null }),
    });
  if (!conversations.length) conversations = await socialRest<Conversation[]>(`conversations?organization_id=eq.${account.organization_id}&channel=eq.${event.channel}&connected_account_id=eq.${account.id}&external_thread_id=eq.${encodeURIComponent(thread)}&select=id,company_id,legacy_company_id,contact_id,lead_id&limit=1`);
  const conversation = conversations[0];
  const existing = await socialRest<Array<{ id: string }>>(`messages?conversation_id=eq.${conversation.id}&external_message_id=eq.${encodeURIComponent(event.externalMessageId)}&select=id&limit=1`);
  if (existing.length) return;
  if (event.isEcho) {
    const manual = await socialRest<Array<{ id: string }>>(`messages?conversation_id=eq.${conversation.id}&direction=eq.outbound&sent_via=eq.manual_assisted&external_message_id=is.null&body=eq.${encodeURIComponent(event.body)}&created_at=gte.${encodeURIComponent(new Date(Date.now()-10*60*1000).toISOString())}&select=id&order=created_at.desc&limit=2`);
    if (manual.length === 1) {
      await socialRest(`messages?id=eq.${manual[0].id}`, { method: 'PATCH', body: JSON.stringify({ external_message_id: event.externalMessageId, status: 'sent' }) });
      return;
    }
  }
  const inserted = await socialRest<Array<{ id: string }>>('messages?on_conflict=conversation_id,external_message_id', {
    method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ organization_id: account.organization_id, conversation_id: conversation.id,
      direction: event.isEcho ? 'outbound' : 'inbound', body: event.body, attachments: event.attachments,
      external_message_id: event.externalMessageId, sent_via: event.isEcho ? 'echo' : null,
      status: 'sent', created_at: event.timestamp }),
  });
  if (!inserted.length) return;
  const timestamp = new Date(event.timestamp);
  const update: Record<string, unknown> = { last_message_at: timestamp.toISOString(), updated_at: new Date().toISOString() };
  if (event.isEcho) update.last_outbound_at = timestamp.toISOString();
  else {
    update.last_inbound_at = timestamp.toISOString();
    update.reply_window_expires_at = new Date(timestamp.getTime() + 24*3600000).toISOString();
    update.unread_count = 1;
    if(matched)await socialRest(`dm_enrollments?organization_id=eq.${account.organization_id}&state=in.(queued,step_due,sent)&entity_type=eq.${matched.entity_type}&entity_id=eq.${matched.entity_id}`,
      { method: 'PATCH', body: JSON.stringify({ state: 'replied', stopped_at: new Date().toISOString(), stop_reason: 'inbound_reply' }) });
  }
  await socialRest(`conversations?id=eq.${conversation.id}`, { method: 'PATCH', body: JSON.stringify(update) });
  if(!event.isEcho) {
    const intent=await classifyIntent(event.body).catch(()=> 'unknown' as const);
    await socialRest(`conversations?id=eq.${conversation.id}`,{method:'PATCH',body:JSON.stringify({intent})});
  }
  if (conversation.company_id) await socialRest('crm_activities', { method: 'POST',
    body: JSON.stringify({ organization_id: account.organization_id, company_id: conversation.company_id,
      contact_id: conversation.contact_id, type: event.isEcho ? 'dm_sent' : 'dm_reply', body: event.body,
      occurred_at: timestamp, metadata: { channel: event.channel, external_message_id: event.externalMessageId, conversation_id: conversation.id } }) });
  await socialRest(`connected_accounts?id=eq.${account.id}`, { method: 'PATCH', body: JSON.stringify({ last_webhook_at: new Date().toISOString() }) });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const secrets = [process.env.OUTREACH_WORKER_TOKEN, process.env.CRON_SECRET].filter(Boolean);
  if (!secrets.length || !secrets.some((secret) => req.headers.authorization === `Bearer ${secret}`)) {
    res.statusCode = 401; res.end('Unauthorized'); return;
  }
  try {
    const now = new Date();
    await socialRest(`social_webhook_events?status=eq.processing&next_attempt_at=lte.${encodeURIComponent(now.toISOString())}`, {
      method: 'PATCH', body: JSON.stringify({ status: 'queued', error: 'Worker lease expired; retrying' }),
    });
    const jobs = await socialRest<Job[]>(`social_webhook_events?status=eq.queued&next_attempt_at=lte.${encodeURIComponent(new Date().toISOString())}&select=id,provider,payload,attempts&order=created_at.asc&limit=50`);
    let processed = 0;
    for (const job of jobs) {
      const claimed = await socialRest<Job[]>(`social_webhook_events?id=eq.${job.id}&status=eq.queued`, {
        method: 'PATCH', body: JSON.stringify({ status: 'processing', attempts: job.attempts + 1,
          next_attempt_at: new Date(Date.now() + 5*60*1000).toISOString() }),
      });
      if (!claimed.length) continue;
      try {
        await processEvent(job);
        await socialRest(`social_webhook_events?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'processed', processed_at: new Date().toISOString(), error: null }) });
        processed++;
      } catch (error) {
        const dead = job.attempts + 1 >= 5;
        await socialRest(`social_webhook_events?id=eq.${job.id}`, { method: 'PATCH', body: JSON.stringify({
          status: dead ? 'dead' : 'queued', next_attempt_at: new Date(Date.now()+Math.min(3600, 30*2**job.attempts)*1000).toISOString(),
          error: String(error).slice(0, 500),
        }) });
        if (dead) await socialRest('integration_alerts', { method: 'POST', body: JSON.stringify({
          provider: job.provider, alert_type: 'webhook_dead_letter', message: String(error).slice(0, 500),
          metadata: { event_id: job.id },
        }) });
        if(dead)await socialRest('rpc/social_slack_notify',{method:'POST',body:JSON.stringify({
          p_event_type:'webhook_failure',p_conversation_id:job.id,p_text:`Social webhook failed after 5 attempts (${job.provider})`,
        })}).catch(()=>{});
      }
    }
    const legacy = await syncLegacyInbound();
    const posts = await processDueSocialPosts(3);
    const metrics = await refreshSocialPostMetrics(2);
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ processed, inspected: jobs.length, legacy, posts, metrics }));
  } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })); }
}
