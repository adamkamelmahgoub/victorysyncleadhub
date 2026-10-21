import {mcpPool} from './mcp-auth.js';
import {SOCIAL_WORKSPACE_ORG_ID} from './social-workspace-auth.js';

const org=SOCIAL_WORKSPACE_ORG_ID;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asObject=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const asString=(value:unknown)=>typeof value==='string'?value:'';

export async function processCalendlyAttribution(event:Record<string,unknown>){
  const type=asString(event.event),payload=asObject(event.payload),tracking=asObject(payload.tracking),scheduled=asObject(payload.scheduled_event);
  if(!['invitee.created','invitee.canceled'].includes(type))return;
  const invitee=asString(payload.uri),eventUri=asString(payload.event)||asString(scheduled.uri);
  if(!invitee||!eventUri)throw new Error('Calendly event has no invitee or scheduled event URI');
  const hintedLead=asString(tracking.utm_content),email=asString(payload.email).trim().toLowerCase();
  const db=await mcpPool.connect();
  try{
    await db.query('begin');
    let lead=uuid.test(hintedLead)?(await db.query<{id:string;owner_rep_id:string|null;outreach_account_id:string|null;outreach_platform:string|null}>(
      'select id,owner_rep_id,outreach_account_id,outreach_platform from public.leads where id=$1 and organization_id=$2',[hintedLead,org])).rows[0]:undefined;
    if(!lead&&email){const found=await db.query<{id:string;owner_rep_id:string|null;outreach_account_id:string|null;outreach_platform:string|null}>(
      'select id,owner_rep_id,outreach_account_id,outreach_platform from public.leads where organization_id=$1 and normalized_email=$2 limit 2',[org,email]);
      if(found.rows.length===1)lead=found.rows[0];}
    if(!lead)throw new Error('Calendly invitee could not be matched to one lead');
    const campaign=asString(tracking.utm_campaign),campaignId=uuid.test(campaign)?campaign:null;
    const start=asString(scheduled.start_time),booked=asString(payload.created_at)||asString(event.created_at);
    if(type==='invitee.created'&&!start)throw new Error('Calendly scheduled time is missing');
    const status=type==='invitee.created'?'booked':payload.rescheduled===true?'rescheduled':'canceled';
    const booking=await db.query<{id:string}>(`insert into public.audit_bookings
      (organization_id,lead_id,rep_user_id,connected_account_id,platform,campaign_id,calendly_event_uri,calendly_invitee_uri,scheduled_at,status,booked_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      on conflict(calendly_invitee_uri) do update set status=excluded.status,updated_at=now()
      returning id`,[org,lead.id,lead.owner_rep_id,lead.outreach_account_id,lead.outreach_platform,campaignId,
      eventUri,invitee,start||null,status,booked||null]);
    if(type==='invitee.created'){
      await db.query(`update public.leads set meeting_at=$2,meeting_booked_by=$3,meeting_booked_at=coalesce(meeting_booked_at,$4)
        where id=$1`,[lead.id,start,lead.owner_rep_id,booked]);
      await db.query(`update public.dm_enrollments set state='stopped',stopped_at=now(),stop_reason='audit_booked'
        where entity_type='lead' and entity_id=$1 and state in ('queued','step_due','sent')`,[lead.id]);
    }
    const eventType=type==='invitee.created'?'audit_booked':'audit_canceled';
    await db.query(`insert into public.outreach_events(organization_id,occurred_at,rep_user_id,connected_account_id,platform,campaign_id,lead_id,
      event_type,source_key,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,jsonb_build_object('booking_id',$10::text)) on conflict(source_key) do nothing`,
      [org,type==='invitee.created'?booked:new Date().toISOString(),lead.owner_rep_id,lead.outreach_account_id,lead.outreach_platform,campaignId,
      lead.id,eventType,`calendly:${invitee}:${type}`,booking.rows[0].id]);
    if(type==='invitee.created')await db.query(`insert into public.notification_outbox(organization_id,channel,slack_target,payload,dedupe_key)
      values($1,'slack',null,jsonb_build_object('event','audit_booked','lead_id',$2::text,'scheduled_at',$3::text),$4)
      on conflict(dedupe_key) do nothing`,[org,lead.id,start,`booking:${invitee}`]);
    await db.query('commit');
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
}

export async function processStripeAttribution(event:Record<string,unknown>){
  const type=asString(event.type),eventId=asString(event.id),object=asObject(asObject(event.data).object),metadata=asObject(object.metadata);
  if(!['checkout.session.completed','invoice.paid','charge.refunded','charge.dispute.created'].includes(type))return;
  if(!eventId)throw new Error('Stripe event ID is missing');
  if(type==='checkout.session.completed'&&object.payment_status!=='paid')return;
  const email=asString(asObject(object.customer_details).email)||asString(object.customer_email);
  const hintedLead=asString(metadata.lead_id);
  const db=await mcpPool.connect();
  try{
    await db.query('begin');
    let lead=uuid.test(hintedLead)?(await db.query<{id:string;owner_rep_id:string|null;outreach_account_id:string|null;outreach_platform:string|null}>(
      'select id,owner_rep_id,outreach_account_id,outreach_platform from public.leads where id=$1 and organization_id=$2',[hintedLead,org])).rows[0]:undefined;
    if(!lead&&email){const found=await db.query<{id:string;owner_rep_id:string|null;outreach_account_id:string|null;outreach_platform:string|null}>(
      'select id,owner_rep_id,outreach_account_id,outreach_platform from public.leads where organization_id=$1 and normalized_email=$2 limit 2',[org,email.toLowerCase()]);
      if(found.rows.length===1)lead=found.rows[0];}
    if(!lead)throw new Error('Stripe event could not be matched to one lead');
    const refund=type==='charge.refunded'||type==='charge.dispute.created';
    const amount=type==='checkout.session.completed'?Number(object.amount_total||0):type==='invoice.paid'?Number(object.amount_paid||0):
      type==='charge.refunded'?Number(object.amount_refunded||0):Number(object.amount||0);
    if(!Number.isSafeInteger(amount)||amount<0)throw new Error('Invalid Stripe amount');
    const amountCents=refund?-amount:amount;
    const paymentId=asString(object.payment_intent)||asString(object.id)||eventId;
    const objectKey=type==='charge.refunded'?`refund:${asString(object.id)}:${amount}`:
      type==='charge.dispute.created'?`dispute:${asString(object.id)}`:`payment:${paymentId}`;
    const created=Number(event.created),occurredAt=Number.isFinite(created)&&created>0?new Date(created*1000).toISOString():new Date().toISOString();
    const campaign=asString(metadata.campaign_id),campaignId=uuid.test(campaign)?campaign:null;
    const inserted=await db.query<{id:string}>(`insert into public.revenue_events
      (organization_id,lead_id,rep_user_id,connected_account_id,platform,campaign_id,stripe_object_id,stripe_event_type,
        amount_cents,currency,occurred_at,refunded,metadata)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      on conflict(stripe_object_id) do nothing returning id`,[org,lead.id,lead.owner_rep_id,lead.outreach_account_id,lead.outreach_platform,
      campaignId,objectKey,type,amountCents,asString(object.currency)||'usd',occurredAt,refund,{source_object_id:object.id||null,stripe_event_id:eventId}]);
    if(inserted.rows.length){
      await db.query(`insert into public.outreach_events(organization_id,occurred_at,rep_user_id,connected_account_id,platform,campaign_id,
        lead_id,event_type,value_cents,source_key,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        on conflict(source_key) do nothing`,[org,occurredAt,lead.owner_rep_id,lead.outreach_account_id,lead.outreach_platform,campaignId,
        lead.id,refund?'refund':'revenue',amountCents,`stripe:${eventId}`,{stripe_event_type:type}]);
      if(!refund&&amountCents>0){
        await db.query(`insert into public.outreach_events(organization_id,occurred_at,rep_user_id,connected_account_id,platform,campaign_id,
          lead_id,event_type,source_key) values($1,$2,$3,$4,$5,$6,$7,'client_closed',$8) on conflict(source_key) do nothing`,
          [org,occurredAt,lead.owner_rep_id,lead.outreach_account_id,lead.outreach_platform,campaignId,lead.id,`client_closed:${lead.id}`]);
      }
      await db.query(`insert into public.notification_outbox(organization_id,channel,slack_target,payload,dedupe_key)
        values($1,'slack',null,jsonb_build_object('event',$2::text,'lead_id',$3::text,'amount_cents',$4::bigint),$5)
        on conflict(dedupe_key) do nothing`,[org,refund?'refund':'payment',lead.id,amountCents,`stripe-alert:${eventId}`]);
    }
    await db.query('commit');
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
}
