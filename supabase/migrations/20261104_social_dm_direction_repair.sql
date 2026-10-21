begin;

-- Normalize events saved by the former V1 parser from the signed raw webhook.
update public.social_webhook_events e set payload=jsonb_set(e.payload,'{payload,is_sender}','true'::jsonb)
from public.webhook_inbox w where e.provider='unipile' and e.inbox_id=w.id
  and w.provider='unipile' and w.parsed->>'is_sender'='true'
  and e.payload->'payload'->>'is_sender' is distinct from 'true';

update public.messages m set direction='outbound',sent_via='echo'
from public.conversations c,public.connected_accounts a,public.webhook_inbox w
where m.conversation_id=c.id and c.connected_account_id=a.id
  and a.provider='unipile' and a.external_account_id=w.parsed->>'account_id'
  and w.provider='unipile' and w.parsed->>'message_id'=m.external_message_id
  and w.parsed->>'is_sender'='true' and m.direction='inbound';

update public.outreach_events e set event_type=case
  when m.sent_via='api' then 'crm_reply_sent'
  when m.direction='inbound' then 'reply_received'
  when m.sent_via='echo' and exists(select 1 from public.messages x where x.conversation_id=m.conversation_id
    and x.direction='inbound' and x.created_at<=m.created_at) then 'device_reply_sent'
  when exists(select 1 from public.messages x where x.conversation_id=m.conversation_id
    and x.direction='outbound' and x.id<>m.id and x.created_at<m.created_at) then 'followup_sent'
  else 'first_dm_sent' end,
  metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object('direction',m.direction,'direction_corrected_at',now()),updated_at=now()
from public.messages m join public.conversations c on c.id=m.conversation_id
join public.connected_accounts a on a.id=c.connected_account_id
where a.provider='unipile' and e.source_key='message:'||m.id::text
  and e.metadata->>'direction' is distinct from m.direction;

update public.social_reply_obligations o set
  completed_at=coalesce((select min(x.created_at) from public.messages x where x.conversation_id=o.conversation_id
    and x.direction='outbound' and x.created_at>=m.created_at),now()),
  completed_message_id=(select x.id from public.messages x where x.conversation_id=o.conversation_id
    and x.direction='outbound' and x.created_at>=m.created_at order by x.created_at,x.id limit 1),updated_at=now()
from public.messages m join public.conversations c on c.id=m.conversation_id
join public.connected_accounts a on a.id=c.connected_account_id
where o.inbound_message_id=m.id and o.completed_at is null and a.provider='unipile'
  and (m.direction<>'inbound' or exists(select 1 from public.messages x where x.conversation_id=m.conversation_id
    and x.direction='outbound' and x.created_at>=m.created_at));

update public.conversations c set
  unread_count=least(c.unread_count,(select count(*)::integer from public.messages m
    where m.conversation_id=c.id and m.direction='inbound' and m.created_at>
      coalesce((select max(x.created_at) from public.messages x where x.conversation_id=c.id and x.direction='outbound'),'epoch'::timestamptz))),
  last_inbound_at=(select max(m.created_at) from public.messages m where m.conversation_id=c.id and m.direction='inbound'),
  last_outbound_at=(select max(m.created_at) from public.messages m where m.conversation_id=c.id and m.direction='outbound'),
  last_message_at=(select max(m.created_at) from public.messages m where m.conversation_id=c.id),
  reply_window_expires_at=(select max(m.created_at)+interval '24 hours' from public.messages m
    where m.conversation_id=c.id and m.direction='inbound'),updated_at=now()
from public.connected_accounts a where c.connected_account_id=a.id and a.provider='unipile';

commit;
