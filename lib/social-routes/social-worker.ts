import type { IncomingMessage, ServerResponse } from 'node:http';
import { processDueSocialPosts,refreshSocialPostMetrics } from './social-posts.js';
import { socialRest } from '../social-service.js';
import type { InboundEvent, MessageStatusEvent } from '../social-providers.js';
import { syncLegacyInbound } from '../social-legacy-sync.js';
import { classifyIntent } from '../social-intent.js';
import {processCalendlyAttribution,processStripeAttribution} from '../social-attribution-worker.js';
import {mcpPool} from '../mcp-auth.js';
import {socialVaultRead} from '../social-vault.js';
import {matchSocialLead} from '../social-matching.js';
import {dispatchSocialNotifications} from '../social-notification-outbox.js';
import {getUnipileConfig,unipileRequest,unipileSenderFlag} from '../social-unipile-client.js';
import {normalizeSocial} from '../social-handles.js';

export const config = { maxDuration: 60 };
type Job = { id: string; provider: string; payload: InboundEvent | MessageStatusEvent | Record<string,unknown>; attempts: number };
type Account = { id: string; organization_id: string };
type Profile = { entity_type: string; entity_id: string };
async function unipileGet(organizationId:string,accountId:string,path:string){
  return unipileRequest(organizationId,path,undefined,accountId);
}

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
    if(status==='active')await mcpPool.query(`insert into public.social_unipile_sync_state(connected_account_id,organization_id,next_sync_at)
      values($1,$2,now()) on conflict(connected_account_id) do update set next_sync_at=now(),updated_at=now()`,[account.id,account.organization_id]);
    return;
  }
  if(type!=='message.new')return;
  const messageId=String(payload.id||''),chatId=String(payload.chat_id||''),senderId=String(payload.sender_id||'');
  if(!messageId||!chatId||!senderId)throw new Error('Incomplete Unipile message');
  const outbound=unipileSenderFlag(payload.is_sender);
  if(outbound===null)throw new Error('Unipile message direction is missing');
  type Conversation={id:string;company_id:string|null;contact_id:string|null;lead_id:string|null;match_status:string;participant_platform_id:string|null};
  let threads=await socialRest<Conversation[]>(`conversations?connected_account_id=eq.${account.id}&external_thread_id=eq.${encodeURIComponent(chatId)}&select=id,company_id,contact_id,lead_id,match_status,participant_platform_id&limit=1`);
  if(!threads.length){
    const chatResponse=outbound&&!payload.participant_id?await unipileGet(account.organization_id,accountId,`/chats/${encodeURIComponent(chatId)}`):null;
    const chat=(chatResponse?.data&&typeof chatResponse.data==='object'?chatResponse.data:chatResponse) as Record<string,unknown>|null;
    if(chat&&chat.is_1to1===false)return;
    const participantId=outbound?String(payload.participant_id||chat?.user_id||chat?.participant_id||''):String(payload.participant_id||senderId);
    if(!participantId)throw new Error('Unipile chat participant is missing');
    const profileResponse:Record<string,unknown>=await unipileGet(account.organization_id,accountId,`/users/${encodeURIComponent(participantId)}`).catch(()=>({}));
    const profile=(profileResponse.data&&typeof profileResponse.data==='object'?profileResponse.data:profileResponse) as Record<string,unknown>;
    const handle=String(profile.public_identifier||payload.participant_handle||''),displayName=String(profile.display_name||profile.name||payload.participant_name||'');
    const profileUrl=String(profile.profile_url||payload.participant_profile_url||'');
    const match=await matchSocialLead({organizationId:account.organization_id,repUserId:account.owner_user_id,
      platform:account.platform as 'instagram'|'linkedin',providerUserId:participantId,
      publicIdentifier:handle||null,profileUrl:profileUrl||null,displayName:displayName||null});
    let crmMatch:{entity_type:string;entity_id:string}|undefined;
    if(match.status==='unmatched'){
      let normalized='';try{if(handle)normalized=normalizeSocial(account.platform==='linkedin'?'linkedin_person':'instagram',handle).normalizedHandle;}catch{}
      if(normalized){const rows=await mcpPool.query<{entity_type:string;entity_id:string}>(`select p.entity_type,p.entity_id
        from public.social_profiles p where p.organization_id=$1 and p.platform=$2 and p.entity_type in ('contact','company')
        and p.normalized_handle=$3 limit 2`,[account.organization_id,account.platform==='linkedin'?'linkedin_person':'instagram',normalized]);
        if(rows.rows.length===1)crmMatch=rows.rows[0];}
    }
    const matched=match.status==='matched'||Boolean(crmMatch);
    threads=await socialRest<Conversation[]>('conversations?on_conflict=organization_id,channel,connected_account_id,external_thread_id',{
      method:'POST',headers:{prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({organization_id:account.organization_id,channel:account.platform,
        connected_account_id:account.id,external_thread_id:chatId,participant_platform_id:participantId,participant_handle:handle||null,
        participant_name:displayName||null,participant_profile_url:profileUrl||null,
        assigned_to:account.owner_user_id,match_status:matched?'matched':match.status,match_confidence:crmMatch?.entity_id?.length?0.95:match.confidence,
        matched_at:matched?new Date().toISOString():null,lead_id:match.status==='matched'?match.leadId:null,
        contact_id:crmMatch?.entity_type==='contact'?crmMatch.entity_id:null,company_id:crmMatch?.entity_type==='company'?crmMatch.entity_id:null,
        suggested_lead_id:match.status==='suggested'&&match.method!=='other_rep'?match.leadId:null})});
    if(match.status==='matched'&&match.leadId)await socialRest(`social_profiles?organization_id=eq.${account.organization_id}&entity_type=eq.lead&entity_id=eq.${match.leadId}&platform=eq.${account.platform==='linkedin'?'linkedin_person':'instagram'}&platform_user_id=is.null`,{
      method:'PATCH',body:JSON.stringify({platform_user_id:participantId,provider_resolved_at:new Date().toISOString()})});
  }
  const thread=threads[0];if(!thread)throw new Error('Unipile conversation could not be created');
  if(thread.match_status==='unmatched'&&!thread.lead_id&&!thread.contact_id&&!thread.company_id&&payload.participant_handle){
    const handle=String(payload.participant_handle),participantId=String(payload.participant_id||thread.participant_platform_id||'');
    const match=await matchSocialLead({organizationId:account.organization_id,repUserId:account.owner_user_id,
      platform:account.platform as 'instagram'|'linkedin',providerUserId:participantId,publicIdentifier:handle,
      profileUrl:String(payload.participant_profile_url||'')||null,displayName:String(payload.participant_name||'')||null});
    if(match.status==='matched'&&match.leadId){await mcpPool.query(`update public.conversations set lead_id=$2,match_status='matched',
      match_confidence=$3,matched_at=now(),updated_at=now() where id=$1 and match_status='unmatched'`,[thread.id,match.leadId,match.confidence]);
      thread.lead_id=match.leadId;}
  }
  if(payload.participant_handle||payload.participant_name||payload.participant_profile_url){
    await mcpPool.query(`update public.conversations set participant_handle=coalesce(nullif($2,''),participant_handle),
      participant_name=coalesce(nullif($3,''),participant_name),participant_profile_url=coalesce(nullif($4,''),participant_profile_url),updated_at=now()
      where id=$1`,[thread.id,String(payload.participant_handle||''),String(payload.participant_name||''),String(payload.participant_profile_url||'')]);
  }
  const now=String(payload.timestamp||raw.created_at||new Date().toISOString()),body=String(payload.text||'').slice(0,50000);
  if(outbound&&body){
    const manual=await socialRest<Array<{id:string}>>(`messages?conversation_id=eq.${thread.id}&direction=eq.outbound&sent_via=eq.manual_assisted&external_message_id=is.null&body=eq.${encodeURIComponent(body)}&created_at=gte.${encodeURIComponent(new Date(Date.now()-10*60*1000).toISOString())}&select=id&order=created_at.desc&limit=2`);
    if(manual.length===1){await socialRest(`messages?id=eq.${manual[0].id}`,{method:'PATCH',body:JSON.stringify({external_message_id:messageId,status:'sent'})});return;}
  }
  const existing=await mcpPool.query<{id:string;direction:string}>(`select id,direction from public.messages where conversation_id=$1 and external_message_id=$2 limit 1`,[thread.id,messageId]);
  if(existing.rows[0]){
    if(existing.rows[0].direction!==(outbound?'outbound':'inbound')){
      await mcpPool.query(`update public.messages set direction=$2,sent_via=$3 where id=$1`,[existing.rows[0].id,outbound?'outbound':'inbound',outbound?'echo':null]);
      await mcpPool.query(`update public.conversations c set unread_count=(select count(*)::integer from public.messages m
        where m.conversation_id=c.id and m.direction='inbound'),
        last_inbound_at=(select max(created_at) from public.messages m where m.conversation_id=c.id and m.direction='inbound'),
        last_outbound_at=(select max(created_at) from public.messages m where m.conversation_id=c.id and m.direction='outbound'),
        reply_window_expires_at=(select max(created_at)+interval '24 hours' from public.messages m where m.conversation_id=c.id and m.direction='inbound'),
        intent=case when not exists(select 1 from public.messages m where m.conversation_id=c.id and m.direction='inbound') then 'unknown' else intent end
        where c.id=$1`,[thread.id]);
      await mcpPool.query(`update public.social_reply_obligations set completed_at=now() where conversation_id=$1
        and not exists(select 1 from public.messages where conversation_id=$1 and direction='inbound')`,[thread.id]);
    }
    return;
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
  await socialRest(`connected_accounts?id=eq.${account.id}`,{method:'PATCH',body:JSON.stringify(raw.source==='reconciliation'
    ?{last_sync_at:new Date().toISOString()}
    :{last_webhook_at:new Date().toISOString(),last_sync_at:new Date().toISOString(),health:'healthy',last_error:null})});
}

export async function reconcileUnipile(accountFilter?:string){
  const due=await mcpPool.query<{connected_account_id:string;organization_id:string;chat_cursor:string|null;initial_sync_complete:boolean;
    external_account_id:string;platform:string}>(`select s.connected_account_id,s.organization_id,s.chat_cursor,s.initial_sync_complete,a.external_account_id,a.platform
      from public.social_unipile_sync_state s join public.connected_accounts a on a.id=s.connected_account_id
      where ($1::uuid is null or s.connected_account_id=$1) and (s.next_sync_at<=now() or $1::uuid is not null)
        and a.provider='unipile' and a.status in ('active','error') and a.external_account_id is not null
      order by s.next_sync_at limit 1`,[accountFilter||null]);
  const state=due.rows[0];if(!state)return 0;
  // A short lease keeps concurrent cron invocations from processing the same page.
  const claim=await mcpPool.query(`update public.social_unipile_sync_state set next_sync_at=now()+interval '5 minutes',updated_at=now()
    where connected_account_id=$1 and (next_sync_at<=now() or $2::boolean) returning connected_account_id`,[state.connected_account_id,Boolean(accountFilter)]);
  if(!claim.rowCount)return 0;
  try{
    const config=await getUnipileConfig(state.organization_id);
    const query=new URLSearchParams(config.api_version==='v1'?{account_id:state.external_account_id,limit:accountFilter?'5':'2'}:{type:'1to1',limit:accountFilter?'5':'2'});
    if(state.chat_cursor)query.set('cursor',state.chat_cursor);
    const response=await unipileGet(state.organization_id,state.external_account_id,`/chats?${query}`);
    const chats=Array.isArray(response.data)?response.data as Record<string,unknown>[]:Array.isArray(response.items)?response.items as Record<string,unknown>[]:[];
    let messages=0;
    for(const chat of chats){
      const chatId=String(chat.id||'');if(!chatId||chat.is_1to1===false)continue;
      const attendeesPage=config.api_version==='v1'?await unipileGet(state.organization_id,state.external_account_id,
        `/chats/${encodeURIComponent(chatId)}/attendees`).catch(()=>({} as Record<string,unknown>)):null;
      const attendees=Array.isArray(attendeesPage?.items)?attendeesPage.items as Record<string,unknown>[]:[];
      const page=await unipileGet(state.organization_id,state.external_account_id,
        `/chats/${encodeURIComponent(chatId)}/messages?limit=30`);
      const items=Array.isArray(page.data)?page.data as Record<string,unknown>[]:Array.isArray(page.items)?page.items as Record<string,unknown>[]:[];
      for(const message of items.reverse()){
        const timestamp=Date.parse(String(message.timestamp||''));
        if(!accountFilter&&!state.initial_sync_complete&&(!Number.isFinite(timestamp)||timestamp<Date.now()-30*86400000))continue;
        const messageId=String(message.id||message.message_id||'');if(!messageId)continue;
        const other=attendees.find(value=>unipileSenderFlag(value.is_self)===false)||attendees.find(value=>String(value.provider_id||value.id||'')!==String(message.sender_id||''));
        const specifics=other?.specifics&&typeof other.specifics==='object'?other.specifics as Record<string,unknown>:{};
        let handle=String(specifics.public_identifier||other?.public_identifier||'');
        if(!handle&&other?.profile_url){try{handle=normalizeSocial(state.platform==='linkedin'?'linkedin_person':'instagram',String(other.profile_url)).handle;}catch{}}
        await processUnipileEvent({account_id:state.external_account_id,type:'message.new',source:'reconciliation',payload:{...message,id:messageId,chat_id:chatId,
            sender_id:message.sender_id||message.sender_provider_id,participant_id:other?.provider_id||other?.id,
            participant_handle:handle||null,
            participant_name:other?.name||other?.display_name,
            participant_profile_url:other?.profile_url,
            text:message.text||message.message}});
        messages++;
      }
    }
    const cursor=response.next_cursor||response.cursor;
    const next=typeof cursor==='string'&&cursor?cursor:null;
    await mcpPool.query(`update public.social_unipile_sync_state set chat_cursor=$2,initial_sync_complete=$3,
      last_sync_at=now(),next_sync_at=now()+($4::integer * interval '1 minute'),last_error=null,updated_at=now()
      where connected_account_id=$1`,[state.connected_account_id,next,!next,next?1:15]);
    await mcpPool.query(`update public.connected_accounts set last_sync_at=now(),status='active',health='healthy',last_error=null where id=$1`,[state.connected_account_id]);
    return messages;
  }catch(error){
    await mcpPool.query(`update public.social_unipile_sync_state set next_sync_at=now()+interval '30 minutes',
      last_error=$2,updated_at=now() where connected_account_id=$1`,[state.connected_account_id,String(error).slice(0,500)]);
    throw error;
  }
}

async function processEvent(job: Job) {
  if(job.provider==='unipile')return processUnipileEvent(job.payload as Record<string,unknown>);
  if(job.provider==='calendly')return processCalendlyAttribution(job.payload as Record<string,unknown>);
  if(job.provider==='stripe')return processStripeAttribution(job.payload as Record<string,unknown>);
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
    const reconciled=await reconcileUnipile().catch(async error=>{
      await socialRest('integration_alerts',{method:'POST',body:JSON.stringify({provider:'unipile',alert_type:'reconciliation_failed',
        message:String(error).slice(0,500)})}).catch(()=>{});return 0;});
    const legacy = await syncLegacyInbound();
    const posts = await processDueSocialPosts(3);
    const metrics = await refreshSocialPostMetrics(2);
    const notifications=await dispatchSocialNotifications(3);
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ processed, inspected: jobs.length, reconciled, legacy, posts, metrics, notifications }));
  } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })); }
}
