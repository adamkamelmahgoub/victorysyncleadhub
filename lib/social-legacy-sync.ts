import { socialRest } from './social-service.js';

const LEGACY_ORG = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
type Cursor = { source:string; cursor_at:string; cursor_id:string|null };
type Lead = { id:string; organization_id:string|null };
function encoded(value:string) { return encodeURIComponent(value); }
async function conversation(org:string, channel:'email'|'sms', thread:string, participant:string, leadId:string|null) {
  type Row = {id:string};
  let rows = await socialRest<Row[]>(`conversations?organization_id=eq.${org}&channel=eq.${channel}&external_thread_id=eq.${encoded(thread)}&connected_account_id=is.null&select=id&limit=1`);
  if (rows.length) return rows[0].id;
  try {
    rows = await socialRest<Row[]>('conversations', { method:'POST', body:JSON.stringify({ organization_id:org,channel,
      external_thread_id:thread,participant_handle:participant,lead_id:leadId }) });
    return rows[0].id;
  } catch (error) {
    rows = await socialRest<Row[]>(`conversations?organization_id=eq.${org}&channel=eq.${channel}&external_thread_id=eq.${encoded(thread)}&connected_account_id=is.null&select=id&limit=1`);
    if (rows.length) return rows[0].id;
    throw error;
  }
}
async function matchLead(kind:'email'|'sms', identity:string, org?:string):Promise<Lead|null> {
  const field = kind === 'email' ? 'normalized_email' : 'normalized_phone';
  const rows = await socialRest<Lead[]>(`leads?${field}=eq.${encoded(identity)}&select=id,organization_id&limit=3`);
  const withinOrg = org ? rows.filter((row)=>(row.organization_id || LEGACY_ORG)===org) : rows;
  return withinOrg.length === 1 ? withinOrg[0] : null;
}
async function syncEmail(row:any) {
  const from = String(row.from_email || '').toLowerCase().trim();
  if (!from) return;
  const lead = await matchLead('email',from);
  const org = lead?.organization_id || LEGACY_ORG;
  const thread = `email:${row.mailbox_id}:${from}`;
  const conversationId = await conversation(org,'email',thread,from,lead?.id || null);
  const inserted = await socialRest<any[]>('messages?on_conflict=conversation_id,external_message_id', {
    method:'POST', headers:{prefer:'resolution=ignore-duplicates,return=representation'},
    body:JSON.stringify({ organization_id:org,conversation_id:conversationId,direction:'inbound',
      body:[row.subject,row.body].filter(Boolean).join('\n\n'),external_message_id:`email:${row.mailbox_id}:${row.provider_id}`,
      status:'sent',created_at:row.received_at }),
  });
  if (inserted.length) await socialRest(`conversations?id=eq.${conversationId}`, {method:'PATCH',body:JSON.stringify({
    last_inbound_at:row.received_at,last_message_at:row.received_at,unread_count:1,
    reply_window_expires_at:null,
  })});
  if(inserted.length&&lead)await socialRest(`dm_enrollments?organization_id=eq.${org}&entity_type=eq.lead&entity_id=eq.${lead.id}&state=in.(queued,step_due,sent)`,{
    method:'PATCH',body:JSON.stringify({state:'replied',stopped_at:new Date().toISOString(),stop_reason:'email_reply'}),
  });
}
async function syncSms(row:any) {
  const direction = row.direction === 'outbound' ? 'outbound' : 'inbound';
  const participant = String(direction==='inbound' ? row.from_number || row.sender : row.to_number || row.recipient).replace(/\D/g,'');
  if (!participant) return;
  const org = row.org_id || LEGACY_ORG;
  const lead = await matchLead('sms',participant,org);
  const conversationId = await conversation(org,'sms',`sms:${participant}`,participant,lead?.id || null);
  const messageId = row.external_message_id || row.external_sms_id || row.external_id || row.id;
  const at = row.message_date || row.sent_at || row.created_at;
  const inserted = await socialRest<any[]>('messages?on_conflict=conversation_id,external_message_id', {
    method:'POST', headers:{prefer:'resolution=ignore-duplicates,return=representation'},
    body:JSON.stringify({organization_id:org,conversation_id:conversationId,direction,
      body:row.body || row.message || row.message_text || '',external_message_id:`sms:${messageId}`,
      status:'sent',created_at:at }),
  });
  if (inserted.length) await socialRest(`conversations?id=eq.${conversationId}`, {method:'PATCH',body:JSON.stringify({
    [direction==='inbound'?'last_inbound_at':'last_outbound_at']:at,last_message_at:at,
    unread_count:direction==='inbound'?1:0,
  })});
  if(inserted.length&&direction==='inbound'&&lead)await socialRest(`dm_enrollments?organization_id=eq.${org}&entity_type=eq.lead&entity_id=eq.${lead.id}&state=in.(queued,step_due,sent)`,{
    method:'PATCH',body:JSON.stringify({state:'replied',stopped_at:new Date().toISOString(),stop_reason:'sms_reply'}),
  });
}
export async function syncLegacyInbound():Promise<{email:number;sms:number}> {
  const counts = {email:0,sms:0};
  for (const [source,kind,column] of [
    ['outreach_inbound_messages','email','recorded_at'],
    ['mightycall_sms_messages','sms','created_at'],
  ] as const) {
    const cursors = await socialRest<Cursor[]>(`social_sync_cursors?source=eq.${source}&select=source,cursor_at,cursor_id`);
    const cursor = cursors[0];
    if (!cursor) throw new Error(`Missing sync cursor: ${source}`);
    const filter = cursor.cursor_id
      ? `or=${encoded(`(${column}.gt.${cursor.cursor_at},and(${column}.eq.${cursor.cursor_at},id.gt.${cursor.cursor_id}))`)}`
      : `${column}=gte.${encoded(cursor.cursor_at)}`;
    const rows = await socialRest<any[]>(`${source}?${filter}&select=*&order=${column}.asc,id.asc&limit=25`);
    let latest = cursor;
    for (const row of rows) {
      const at = new Date(row[column]).toISOString();
      if (at < cursor.cursor_at || at === cursor.cursor_at && row.id <= (cursor.cursor_id || '')) continue;
      if (kind==='email') { await syncEmail(row);counts.email++; }
      else { await syncSms(row);counts.sms++; }
      latest = {source,cursor_at:at,cursor_id:row.id};
    }
    if (latest !== cursor) await socialRest(`social_sync_cursors?source=eq.${source}`, {
      method:'PATCH',body:JSON.stringify({cursor_at:latest.cursor_at,cursor_id:latest.cursor_id,updated_at:new Date().toISOString()}),
    });
  }
  return counts;
}
