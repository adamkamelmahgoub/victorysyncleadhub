alter table public.conversations add column if not exists participant_name text;
alter table public.conversations add column if not exists participant_profile_url text;

create index if not exists conversations_account_recent_idx
  on public.conversations(connected_account_id,last_message_at desc);

-- V1 webhooks explicitly mark phone sent messages. Repair events stored before
-- the direction parser honored that flag; retain message IDs and history.
with outbound_events as (
  select distinct on (a.id,w.parsed->>'message_id') a.id account_id,
    w.parsed->>'message_id' message_id,w.parsed->'attendees' attendees,
    w.parsed->'account_info'->>'user_id' owner_id
  from public.webhook_inbox w
  join public.connected_accounts a on a.provider='unipile' and a.external_account_id=w.parsed->>'account_id'
  where w.provider='unipile' and w.parsed->>'event'='message_received' and w.parsed->>'is_sender'='true'
  order by a.id,w.parsed->>'message_id',w.id desc
)
update public.messages m set direction='outbound',sent_via='echo'
from public.conversations c,outbound_events e
where m.conversation_id=c.id and c.connected_account_id=e.account_id
  and m.external_message_id=e.message_id and m.direction='inbound';

update public.conversations c set
  unread_count=(select count(*)::integer from public.messages m where m.conversation_id=c.id and m.direction='inbound'),
  last_inbound_at=(select max(created_at) from public.messages m where m.conversation_id=c.id and m.direction='inbound'),
  last_outbound_at=(select max(created_at) from public.messages m where m.conversation_id=c.id and m.direction='outbound'),
  reply_window_expires_at=(select max(created_at)+interval '24 hours' from public.messages m where m.conversation_id=c.id and m.direction='inbound'),
  intent=case when not exists(select 1 from public.messages m where m.conversation_id=c.id and m.direction='inbound') then 'unknown' else c.intent end,
  updated_at=now()
where c.connected_account_id in(select id from public.connected_accounts where provider='unipile')
  and exists(select 1 from public.webhook_inbox w where w.provider='unipile'
    and w.parsed->>'chat_id'=c.external_thread_id and w.parsed->>'is_sender'='true');

with participants as (
  select distinct on(c.id) c.id conversation_id,
    attendee->>'attendee_public_identifier' handle,
    attendee->>'attendee_name' name,
    attendee->>'attendee_profile_url' profile_url,
    attendee->>'attendee_provider_id' provider_id
  from public.webhook_inbox w
  join public.connected_accounts a on a.provider='unipile' and a.external_account_id=w.parsed->>'account_id'
  join public.conversations c on c.connected_account_id=a.id and c.external_thread_id=w.parsed->>'chat_id'
  cross join lateral jsonb_array_elements(coalesce(w.parsed->'attendees','[]'::jsonb)) attendee
  where w.provider='unipile' and attendee->>'attendee_provider_id' is distinct from
    (case when w.parsed->>'is_sender'='true' then w.parsed->'sender'->>'attendee_provider_id'
      else w.parsed->'account_info'->>'user_id' end)
    and attendee->>'attendee_provider_id' is not null
  order by c.id,w.id desc
)
update public.conversations c set
  participant_handle=coalesce(nullif(p.handle,''),c.participant_handle),
  participant_name=coalesce(nullif(p.name,''),c.participant_name),
  participant_profile_url=coalesce(nullif(p.profile_url,''),c.participant_profile_url),
  participant_platform_id=coalesce(nullif(p.provider_id,''),c.participant_platform_id),updated_at=now()
from participants p where c.id=p.conversation_id;

update public.conversations c set participant_handle=lower((regexp_match(c.participant_profile_url,
  '^https://(www\.|m\.)?instagram\.com/([A-Za-z0-9._]+)/?(\?.*)?$'))[2]),updated_at=now()
where c.channel='instagram' and c.participant_handle is null
  and c.participant_profile_url ~ '^https://(www\.|m\.)?instagram\.com/[A-Za-z0-9._]+/?(\?.*)?$';

update public.conversations c set lead_id=p.entity_id,match_status='matched',match_confidence=0.95,matched_at=now()
from public.social_profiles p where c.organization_id=p.organization_id and p.entity_type='lead'
  and p.platform=case when c.channel='linkedin' then 'linkedin_person' else c.channel end
  and c.participant_handle is not null and p.normalized_handle=lower(regexp_replace(c.participant_handle,'^@',''))
  and c.lead_id is null and c.match_status='unmatched'
  and not exists(select 1 from public.social_profiles other where other.organization_id=p.organization_id
    and other.platform=p.platform and other.normalized_handle=p.normalized_handle and other.entity_type='lead' and other.id<>p.id);

update public.social_reply_obligations o set completed_at=now()
from public.conversations c where c.id=o.conversation_id and o.completed_at is null
  and not exists(select 1 from public.messages m where m.conversation_id=c.id and m.direction='inbound');
